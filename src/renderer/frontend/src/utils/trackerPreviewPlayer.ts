import { TrackerPatternEvent, TrackerSample } from './trackerModule';
import { trackerStoredNoteToPitch } from './trackerPianoRollModel';
import { s3mVibratoSemitoneOffset } from './trackerS3mVibrato';
import { applyTrackerItFineVolume, applyTrackerItVolumeSlideTick, trackerItChannelVolumeSet, trackerItGlobalVolumeSet } from './trackerItFineVolume';
import { applyTrackerItRetriggerVolume } from './trackerItRetrigger';
import { trackerMaxmodRowRetriggerCount } from './trackerMaxmodRetrigger';
import { createTrackerXmOldTremorState, trackerXmOldTremorParameterAt, trackerXmOldTremorTick, type TrackerXmOldTremorState } from './trackerXmOldTremor';
import { maxmodGbaTickDurationSeconds } from './trackerMaxmodTiming';
import { trackerS3mMaxmodAmigaPeriod, trackerS3mMaxmodMixerStepQ12, trackerS3mMaxmodMixerStepQ12FromPeriod, trackerS3mMaxmodPlaybackRateScale, trackerS3mMaxmodSlidePeriods } from './trackerS3mMaxmodPitch';
import { trackerItMaxmodAmigaPeriod, trackerItMaxmodFineVibratoPitch, trackerItMaxmodMixerStepQ12, trackerItMaxmodPlaybackRateScale, trackerItMaxmodTremoloVolumeAt } from './trackerItMaxmodPitch';
import { trackerModMaxmodBasePlaybackScale, trackerModMaxmodMixerStepQ12, trackerModMaxmodPlaybackRateScale } from './trackerModMaxmodPitch';
import { trackerModVolumeRow } from './trackerModVolume';
import { trackerS3mVolumeForEvent } from './trackerS3mVolume';
import { trackerXmArpeggioPitchAtTick, trackerXmMaxmodBasePlaybackScale, trackerXmMaxmodLinearPeriod, trackerXmMaxmodLinearPitch, trackerXmMaxmodLinearSlidePeriod, trackerXmMaxmodMixerStepQ12, trackerXmMaxmodPlaybackRateScale } from './trackerXmMaxmodPitch';
import { trackerEnvelopeFadeoutAt, trackerEnvelopeFrameTimes, trackerEnvelopePanningAt, trackerEnvelopeValueAt } from './trackerEnvelope';
import { convertTrackerSampleToMaxmodGbaPcm } from './trackerMaxmodSamplePcm';
import { createTrackerMaxmodGbaSample, TRACKER_MAXMOD_GBA_MIX_RATE } from './trackerMaxmodGbaSample';
import { trackerMaxmodGbaMixerVolume, trackerMaxmodGbaOutputGain } from './trackerMaxmodGbaVolume';
import { trackerItExtendedPanToNormalized, trackerItPanByteToNormalized } from './trackerItPan';
import { trackerItEventTriggersNote, trackerItInstrumentMemoryAfterEvent } from './trackerItInstrumentMemory';
import { trackerPreviewPanCompensationGain, trackerPreviewPanPosition } from './trackerPreviewPan';
import trackerOutputLimiterWorkletUrl from './trackerOutputLimiter.worklet.js?url';

const maxmodMasterVolume = 1024;
const trackerAuditionGain = 0.65;

const hasTrackerMusicalNote = (format: string, event: TrackerPatternEvent) => format === 'IT'
  ? (event.notePresent ?? event.instrument > 0)
    && event.note >= 0
    && event.note <= 119
    && !(event.instrumentPresent && event.instrument === 0)
  : format === 'S3M'
    ? (event.notePresent ?? event.note > 0) && trackerStoredNoteToPitch('S3M', event.note) > 0
    : event.note > 0;

const isTrackerKeyOff = (format: string, event?: TrackerPatternEvent) => {
  if (!event) return false;
  if (format === 'XM') return event.note === 97;
  if (format === 'S3M') return event.note === 254;
  return event.note >= 254 || format === 'IT' && event.note === 246;
};

type TrackerPreviewChannelVoice = {
  source?: AudioScheduledSourceNode;
  pitch: AudioParam;
  rootNote: number;
  pitchValue: number;
  oscillator: boolean;
  gain: GainNode;
  sampleVolume: number;
  defaultVolume?: number;
  channelVolume: number;
  baseVolume?: number;
  rowPitchModulated?: boolean;
  rowVolumeModulated?: boolean;
  maxmodSampleGlobalVolume?: number;
  maxmodInstrumentGlobalVolume?: number;
  sampleRate?: number;
  xmLinearPeriods?: boolean;
  basePlaybackScale?: number;
  s3mBasePitch?: number;
  s3mBasePeriod?: number;
  s3mPeriod?: number;
  fadeout?: number;
  fadeoutMaximum?: number;
  activeSources?: Set<AudioScheduledSourceNode>;
};

const modVoiceGainAtVolume = (volume: number, channelVolume: number, laneMixScale: number) => {
  const mixerVolume = trackerMaxmodGbaMixerVolume({
    sampleGlobalVolume: 64,
    instrumentGlobalVolume: 128,
    channelVolume: 64,
    channelBaseVolume: volume,
    moduleGlobalVolume: 64,
    xmGlobalVolume: false,
    fade: maxmodMasterVolume,
    moduleVolume: maxmodMasterVolume,
  });
  return trackerMaxmodGbaOutputGain(mixerVolume, 'MOD') * channelVolume / Math.max(1, laneMixScale);
};
const clampModPeriod = (period: number) => Math.max(113, Math.min(856, period));
const modPeriodToPitch = (period: number) => 49 + 12 * Math.log2(428 / clampModPeriod(period));
const modPitchToPeriod = (pitch: number) => clampModPeriod(428 * Math.pow(2, (49 - pitch) / 12));
const trackerPanningNibbleToNormalized = (nibble: number) => Math.max(-1, Math.min(1, (nibble & 0x0f) / 8 - 1));
const xmWaveform = (waveform: number, phase: number, pitchModulation: boolean): number => {
  const cycle = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  const shape = waveform & 0x03;
  if (shape === 1) return pitchModulation
    ? cycle < 0.5 ? -cycle * 2 : 2 - cycle * 2
    : cycle < 0.5 ? cycle * 2 : 1 - cycle * 2;
  if (shape === 2 || shape === 3) return cycle < 0.5 ? (pitchModulation ? -1 : 1) : (pitchModulation ? 1 : -1);
  return Math.sin(phase) * (pitchModulation ? -1 : 1);
};

/**
 * Lightweight structural tracker preview. It deliberately synthesizes notes
 * instead of pretending that browser audio reproduces tracker samples/effects;
 * the runtime/ROM remains the fidelity reference.
 */
export class TrackerPreviewPlayer {
  private context: AudioContext | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private gainNodes: GainNode[] = [];
  private channelMuteGains: GainNode[] = [];
  private auditionContext: AudioContext | null = null;
  private auditionSource: AudioScheduledSourceNode | null = null;
  private auditionGeneration = 0;
  private progressFrame: number | null = null;
  private generation = 0;
  private limiterInputPeak = 0;
  private limiterPeak = 0;
  private limiterKind: 'AudioWorklet' | 'ScriptProcessor' | null = null;

  private trackSource(source: AudioScheduledSourceNode, onEnded?: () => void): void {
    this.sources.add(source);
    source.addEventListener('ended', () => {
      this.sources.delete(source);
      source.disconnect();
      onEnded?.();
    }, { once: true });
  }

  /** Returns the highest post-limiter sample observed during the current playback. */
  getLimiterPeak(): number { return this.limiterPeak; }
  /** Returns the highest sample entering the MOD output limiter. */
  getLimiterInputPeak(): number { return this.limiterInputPeak; }
  getLimiterKind(): 'AudioWorklet' | 'ScriptProcessor' | null { return this.limiterKind; }

  /** Plays a short audition voice for a newly entered note using its mapped sample. */
  async auditionNote(note: number, instrument: number, samples: Map<number, TrackerSample>, format: 'MOD' | 'XM' | 'S3M' | 'IT' = 'XM', durationSeconds = 0.42): Promise<void> {
    this.stopAudition(false);
    const generation = this.auditionGeneration;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor || note < 1 || note > 120) return;
    const context = this.auditionContext && this.auditionContext.state !== 'closed'
      ? this.auditionContext
      : new AudioContextCtor();
    this.auditionContext = context;
    try { await context.resume(); }
    catch (error) {
      if (generation !== this.auditionGeneration || context !== this.auditionContext || context.state === 'closed') return;
      throw error;
    }
    // A newer audition can reuse this context while resume is pending.
    if (generation !== this.auditionGeneration || context !== this.auditionContext) return;
    const instrumentSample = samples.get(instrument);
    const noteIndex = Math.max(0, Math.min((instrumentSample?.noteMap?.length ?? 96) - 1, note - 1));
    const sampleIndex = instrumentSample?.noteMap?.[noteIndex] ?? 0;
    const sample = instrumentSample?.variants?.[sampleIndex] ?? instrumentSample;
    const gain = context.createGain();
    const samplePan = (format === 'XM' || format === 'IT') && typeof sample?.panning === 'number'
      ? Math.max(-1, Math.min(1, (sample.panning - 128) / 128))
      : 0;
    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
    const panGain = panner ? context.createGain() : null;
    const sampleVolume = sample?.volume ?? 64;
    const volume = Math.max(0, Math.min(1, sampleVolume / 64));
    const when = context.currentTime + 0.01;
    const duration = Number.isFinite(durationSeconds) ? Math.max(0.02, durationSeconds) : 0.42;
    const release = Math.min(0.04, duration / 4);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, trackerAuditionGain * volume), when + 0.008);
    gain.gain.setValueAtTime(Math.max(0.0001, trackerAuditionGain * volume), when + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    if (panner && panGain) {
      panner.pan.setValueAtTime(trackerPreviewPanPosition(samplePan), when);
      panGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(samplePan), when);
      gain.connect(panner).connect(panGain).connect(context.destination);
    } else gain.connect(context.destination);
    const sourceNote = note + (instrumentSample?.noteTranspose?.[noteIndex] ?? 0);
    if (sample?.samples.length) {
      const sampleRate = Math.max(1, sample.sampleRate || 8363);
      const sampleRootNote = sample.rootNote ?? 49;
      const maxmodBasePitch = format === 'S3M' ? Math.trunc(sourceNote) : sampleRootNote;
      const basePlaybackScale = format === 'S3M'
        ? trackerS3mMaxmodPlaybackRateScale(sampleRate, maxmodBasePitch, maxmodBasePitch)
        : format === 'IT' ? trackerItMaxmodPlaybackRateScale(sampleRate, maxmodBasePitch, sampleRootNote)
        : format === 'XM' ? trackerXmMaxmodBasePlaybackScale(sampleRate)
          : format === 'MOD' ? trackerModMaxmodBasePlaybackScale(sampleRate, maxmodBasePitch, sample.fineTune ?? 0) : 1;
      const convertedSamples = convertTrackerSampleToMaxmodGbaPcm(sample.samples, sample.sixteenBit);
      const maxmodStep = format === 'S3M' ? trackerS3mMaxmodMixerStepQ12(sampleRate, maxmodBasePitch)
        : format === 'IT' ? trackerItMaxmodMixerStepQ12(sampleRate, maxmodBasePitch)
        : format === 'XM' ? trackerXmMaxmodMixerStepQ12(sampleRate, 48)
          : format === 'MOD' ? trackerModMaxmodMixerStepQ12(sampleRate, maxmodBasePitch, sample.fineTune ?? 0) : 0;
      const maxmodSample = (format === 'S3M' || format === 'IT' || format === 'XM' || format === 'MOD') && maxmodStep > 0
        ? createTrackerMaxmodGbaSample(convertedSamples, maxmodStep)
        : null;
      const bufferRate = maxmodSample?.sampleRate ?? sampleRate;
      const bufferSamples = maxmodSample?.samples ?? convertedSamples;
      const buffer = context.createBuffer(1, bufferSamples.length, bufferRate);
      buffer.copyToChannel(bufferSamples, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = format === 'S3M' && maxmodSample
        ? 1
        : format === 'IT' && maxmodSample
          ? Math.pow(2, (sourceNote - sampleRootNote) / 12)
            * trackerItMaxmodPlaybackRateScale(sampleRate, sourceNote, sampleRootNote) / basePlaybackScale
        : format === 'XM' && maxmodSample
          ? trackerXmMaxmodPlaybackRateScale(sampleRate, sourceNote - 1 + sampleRootNote - 48 + (sample.fineTune ?? 0) / 128, 48)
          : format === 'MOD' && maxmodSample
            ? trackerModMaxmodPlaybackRateScale(sampleRate, sourceNote, sampleRootNote, sample.fineTune ?? 0)
          : Math.pow(2, (sourceNote - sampleRootNote) / 12);
      if (sample.loopType !== 0 && sample.loopEnd > sample.loopStart) {
        source.loop = true;
        source.loopStart = sample.loopStart / (sampleRate * basePlaybackScale);
        source.loopEnd = sample.loopEnd / (sampleRate * basePlaybackScale);
      }
      source.connect(gain);
      source.start(when);
      source.stop(when + duration + 0.01);
      this.auditionSource = source;
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = 440 * Math.pow(2, (sourceNote - 49) / 12);
      oscillator.connect(gain);
      oscillator.start(when);
      oscillator.stop(when + duration + 0.01);
      this.auditionSource = oscillator;
    }
    const auditionSource = this.auditionSource;
    auditionSource.onended = () => {
      auditionSource.disconnect();
      gain.disconnect();
      if (this.auditionSource === auditionSource) this.auditionSource = null;
    };
  }

  releaseAudition(): void { this.stopAudition(false); }

  private stopAudition(closeContext = true): void {
    this.auditionGeneration += 1;
    try { this.auditionSource?.stop(); } catch { /* already stopped */ }
    this.auditionSource?.disconnect();
    this.auditionSource = null;
    if (closeContext) {
      void this.auditionContext?.close();
      this.auditionContext = null;
    }
  }

  setChannelMuted(channel: number, muted: boolean): void {
    const gain = this.channelMuteGains[channel];
    if (gain && this.context) gain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.005);
  }

  async play(rows: TrackerPatternEvent[][], channels: number, speed = 6, tempo = 125, muted: boolean[] = [], samples = new Map<number, TrackerSample>(), format: 'MOD' | 'XM' | 'S3M' | 'IT' = 'XM', channelVolumes: number[] = [], initialPans: number[] = [], onRow?: (row: number) => void, silent = false, initialGlobalVolume?: number, _scratchComposition = false, itLinearSlides = false, maxmodChannelVolumes: number[] = [], isolatedAudition = false): Promise<number> {
    this.stop();
    this.limiterInputPeak = 0;
    this.limiterPeak = 0;
    this.limiterKind = null;
    const generation = this.generation;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return 0;
    const context = new AudioContextCtor();
    this.context = context;
    // Keep the audio clock still while long tracker arrangements are being
    // expanded into Web Audio voices. Otherwise the UI-thread scheduler can
    // spend longer building a song than its first rows take to play, forcing
    // later voices to be started in the past and collapsing the arrangement.
    try { await context.suspend(); }
    catch (error) {
      if (generation !== this.generation || context !== this.context || context.state === 'closed') return 0;
      this.stop();
      throw error;
    }
    if (generation !== this.generation || !this.context) return 0;
    const output = this.context.createGain();
    // A centered Maxmod lane sends half its gain to each stereo side. Match
    // the editor's mono audition (same signal on both sides) for isolated notes.
    output.gain.value = silent ? 0 : isolatedAudition ? trackerAuditionGain : 1;
    const xmGlobalVolumeGain = this.context.createGain();
    xmGlobalVolumeGain.gain.value = 1;
    const trackerGlobalVolumeGain = this.context.createGain();
    let limiterNode: AudioNode | null = null;
    // Sample and saturate the summed tracker voices at Maxmod's default GBA
    // mixer rate before handing the held PCM8 output to Web Audio.
    const outputSampleRate = this.context.sampleRate;
    const gbaMixRate = Math.min(outputSampleRate, TRACKER_MAXMOD_GBA_MIX_RATE);
    let gbaMixPhase = outputSampleRate - gbaMixRate;
    const gbaHeldMixSamples = [0, 0];
    try {
      await this.context.audioWorklet.addModule(trackerOutputLimiterWorkletUrl);
      if (generation !== this.generation || !this.context) return 0;
      const limiter = new AudioWorkletNode(this.context, 'tracker-output-limiter', {
        outputChannelCount: [2],
        processorOptions: { mixRate: gbaMixRate },
      });
      limiter.port.onmessage = event => {
        if (typeof event.data === 'number' && Number.isFinite(event.data)) this.limiterPeak = Math.max(this.limiterPeak, event.data);
        else if (event.data && typeof event.data === 'object') {
          if (Number.isFinite(event.data.inputPeak)) this.limiterInputPeak = Math.max(this.limiterInputPeak, event.data.inputPeak);
          if (Number.isFinite(event.data.outputPeak)) this.limiterPeak = Math.max(this.limiterPeak, event.data.outputPeak);
        }
      };
      limiterNode = limiter;
      this.limiterKind = 'AudioWorklet';
    } catch (error) {
      if (generation !== this.generation || !this.context) return 0;
      console.warn('Tracker AudioWorklet limiter failed to load; using the JavaScript ScriptProcessor fallback.', error);
      const fallback = this.context.createScriptProcessor(512, 2, 2);
      fallback.onaudioprocess = event => {
        const channelCount = event.outputBuffer.numberOfChannels;
        const inputs = Array.from({ length: channelCount }, (_, channel) => event.inputBuffer.getChannelData(Math.min(channel, event.inputBuffer.numberOfChannels - 1)));
        const outputs = Array.from({ length: channelCount }, (_, channel) => event.outputBuffer.getChannelData(channel));
        for (let frame = 0; frame < outputs[0].length; frame += 1) {
          gbaMixPhase += gbaMixRate;
          let mixTick = false;
          if (gbaMixPhase >= outputSampleRate) {
            gbaMixPhase -= outputSampleRate;
            mixTick = true;
          }
          for (let channel = 0; channel < channelCount; channel += 1) {
            const input = inputs[channel];
            const outputSamples = outputs[channel];
            const sample = input[frame];
            this.limiterInputPeak = Math.max(this.limiterInputPeak, Math.abs(sample));
            if (mixTick) {
              const pcm8 = Math.max(-128, Math.min(127, Math.floor(sample * 128)));
              gbaHeldMixSamples[channel] = pcm8 / 128;
            }
            const saturated = gbaHeldMixSamples[channel] ?? 0;
            outputSamples[frame] = saturated;
            this.limiterPeak = Math.max(this.limiterPeak, Math.abs(saturated));
          }
        }
      };
      limiterNode = fallback;
      this.limiterKind = 'ScriptProcessor';
    }
    if (format === 'XM') output.connect(xmGlobalVolumeGain).connect(limiterNode);
    else if (format === 'S3M' || format === 'IT') output.connect(trackerGlobalVolumeGain).connect(limiterNode);
    else output.connect(limiterNode);
    limiterNode.connect(this.context.destination);
    const start = this.context.currentTime + 0.025;
    const audioBufferCache = new WeakMap<TrackerSample, Map<number, { buffer: AudioBuffer; basePlaybackScale: number }>>();
    const audioBufferCacheOrder: Array<{ sample: TrackerSample; key: number; entry: { buffer: AudioBuffer; basePlaybackScale: number } }> = [];
    let cachedAudioBufferFrames = 0;
    const maxCachedAudioBufferFrames = 4 * 1024 * 1024;
    const maxCachedAudioBuffers = 256;
    // Maxmod sums each audible lane and saturates its final signed 8-bit mix;
    // it does not divide voice gain by the number of occupied tracker lanes.
    // Keep Web Audio voice levels independent of channel count and let the
    // output stage handle dense mixes.
    const laneMixScale = 1;
    let timingSpeed = Math.max(1, speed);
    let timingTempo = Math.max(32, tempo);
    const globalVolumeMaximum = format === 'IT' ? 128 : 64;
    let globalVolume = format === 'IT' ? Math.max(0, Math.min(globalVolumeMaximum, initialGlobalVolume ?? 128)) : Math.max(0, Math.min(globalVolumeMaximum, initialGlobalVolume ?? 64));
    let globalVolumeSlideMemory = 0;
    if (format === 'S3M' || format === 'IT') trackerGlobalVolumeGain.gain.setValueAtTime(globalVolume / globalVolumeMaximum, start);
    let xmGlobalVolume = 64;
    let xmGlobalVolumeSlideMemory = 0;
    const xmActiveNoteVolumes = Array.from({ length: channels }, () => 64);
    let elapsed = 0;
    const rowTimes: number[] = [];
    const rowDurations: number[] = [];
    const rowSpeeds: number[] = [];
    const rowTickDurations: number[] = [];
    const rowTickCounts: number[] = [];
    const noteRowsByChannel = Array.from({ length: channels }, () => [] as number[]);
    const itInstrumentMemoryForTiming = Array.from({ length: channels }, () => 0);
    const itNnaModeChangesByChannel = Array.from({ length: channels }, () => [] as Array<{ row: number; mode: number }>);
    const modVibratoSpeedMemory = Array.from({ length: channels }, () => 0);
    const modVibratoDepthMemory = Array.from({ length: channels }, () => 0);
    const modVibratoPhase = Array.from({ length: channels }, () => 0);
    const xmChannelSlideVolumes = Array.from({ length: channels }, () => 64);
    const xmVolumeSlideMemory = Array.from({ length: channels }, () => 0);
    const xmVolumeColumnSlideMemory = Array.from({ length: channels }, () => 0);
    const xmFineVolumeColumnSlideMemory = Array.from({ length: channels }, () => 0);
    const xmVibratoSpeedMemory = Array.from({ length: channels }, () => 0);
    const xmVibratoDepthMemory = Array.from({ length: channels }, () => 0);
    const xmVibratoPhases = Array.from({ length: channels }, () => 0);
    const xmTremoloPhases = Array.from({ length: channels }, () => 0);
    const xmPitchUpMemory = Array.from({ length: channels }, () => 0);
    const xmPitchDownMemory = Array.from({ length: channels }, () => 0);
    const xmTremoloMemory = Array.from({ length: channels }, () => 0);
    const xmVibratoWaveforms = Array.from({ length: channels }, () => 0);
    const xmTremoloWaveforms = Array.from({ length: channels }, () => 0);
const itVibratoSpeedMemory = Array.from({ length: channels }, () => 0);
const itVibratoDepthMemory = Array.from({ length: channels }, () => 0);
const itVibratoPhases = Array.from({ length: channels }, () => 0);
const itTremoloPhases = Array.from({ length: channels }, () => 0);
    const xmTonePortamentoSpeeds = Array.from({ length: channels }, () => 0);
    const xmTonePortamentoTargets: Array<number | undefined> = Array.from({ length: channels });
    const xmGlissandoEnabled = Array.from({ length: channels }, () => false);
    const s3mTonePortamentoSpeeds = Array.from({ length: channels }, () => 0);
    const s3mTonePortamentoTargets: Array<number | undefined> = Array.from({ length: channels });
    const s3mPitchSlideMemory = Array.from({ length: channels }, () => 0);
    const itPitchSlideMemory = Array.from({ length: channels }, () => 0);
    const s3mVibratoSpeed = Array.from({ length: channels }, () => 0);
    const s3mVibratoDepth = Array.from({ length: channels }, () => 0);
    const s3mVibratoPhase = Array.from({ length: channels }, () => 0);
    const s3mActiveNoteVolumes = Array.from({ length: channels }, () => 64);
    const s3mBaseNoteVolumes = Array.from({ length: channels }, () => 64);
    const itChannelVolumes = Array.from({ length: channels }, (_, channel) => Math.max(0, Math.min(64, maxmodChannelVolumes[channel] ?? 64)));
    const itNoteVolumes = Array.from({ length: channels }, () => 64);
    const xmOldTremorStates: TrackerXmOldTremorState[] = Array.from({ length: channels }, createTrackerXmOldTremorState);
    const itChannelVolumeSlideMemory = Array.from({ length: channels }, () => 0);
    const channelOutputs = Array.from({ length: channels }, (_, channel) => {
      const gate = this.context!.createGain();
      gate.gain.value = muted[channel] ? 0 : 1;
      gate.connect(output);
      return gate;
    });
    this.channelMuteGains = channelOutputs;
    const s3mVolumeSlideFaders = format === 'S3M' || format === 'IT' ? Array.from({ length: channels }, (_, channel) => {
      const fader = this.context!.createGain();
      fader.gain.value = 1;
      fader.connect(channelOutputs[channel]);
      return fader;
    }) : [];
    const s3mVolumeColumnFaders = format === 'S3M' ? Array.from({ length: channels }, () => {
      const fader = this.context!.createGain();
      fader.gain.value = 1;
      return fader;
    }) : [];
    s3mVolumeColumnFaders.forEach((fader, channel) => fader.connect(s3mVolumeSlideFaders[channel] ?? channelOutputs[channel]));
    const xmOldTremorFaders = format === 'XM' ? Array.from({ length: channels }, (_, channel) => {
      const fader = this.context!.createGain();
      fader.gain.value = 1;
      fader.connect(channelOutputs[channel]);
      return fader;
    }) : [];
    const channelFaders = format !== 'MOD' ? Array.from({ length: channels }, (_, channel) => {
      const fader = this.context!.createGain();
      fader.gain.value = format === 'IT' ? itChannelVolumes[channel]! / 64 : 1;
      fader.connect(xmOldTremorFaders[channel] ?? s3mVolumeColumnFaders[channel] ?? s3mVolumeSlideFaders[channel] ?? channelOutputs[channel]);
      return fader;
    }) : [];
    const maxmodMixerVolumeAt = (channelBaseVolume: number, sample: TrackerSample | undefined, voiceFormat = format) => trackerMaxmodGbaMixerVolume({
      sampleGlobalVolume: sample?.maxmodSampleGlobalVolume ?? 64,
      instrumentGlobalVolume: sample?.maxmodInstrumentGlobalVolume ?? 128,
      channelVolume: 64,
      channelBaseVolume,
      moduleGlobalVolume: voiceFormat === 'MOD' || voiceFormat === 'XM' ? 64 : 128,
      xmGlobalVolume: voiceFormat === 'XM',
      fade: maxmodMasterVolume,
      moduleVolume: maxmodMasterVolume,
    });
    // Resolve timing and note boundaries before scheduling so each voice can
    // sustain until its next note or key-off instead of being cut after one row.
    rows.forEach((row, rowIndex) => {
      const s3mItTempoSlides: number[] = [];
      // Global speed/tempo commands apply to the row that contains them. In
      // particular MOD Fxx changes the tick count before this row is timed.
      row.forEach(event => {
        if (!event) return;
        const effect = event.effect & 0xff;
        const parameter = event.parameter & 0xff;
        if ((format === 'XM' || format === 'MOD') && effect === 0x0f && parameter > 0) {
          if (parameter < 0x20) timingSpeed = parameter;
          else timingTempo = Math.max(32, parameter);
        } else if ((format === 'S3M' || format === 'IT') && effect === 0x01 && parameter > 0) {
          timingSpeed = parameter;
        } else if ((format === 'S3M' || format === 'IT') && effect === 0x14) {
          if (parameter >= 0x20) timingTempo = Math.min(255, parameter);
          else s3mItTempoSlides.push(parameter);
        }
      });
      rowTimes.push(elapsed);
      rowSpeeds.push(timingSpeed);
      let patternDelay = 0;
      if (format === 'XM') {
        for (const event of row) {
          if (event && (event.effect & 0xff) === 0x0e && ((event.parameter >> 4) & 0x0f) === 0x0e) {
            patternDelay = event.parameter & 0x0f;
            break;
          }
        }
      } else if (format === 'S3M' || format === 'IT') {
        // S3M/IT SEx repeats the row duration without retriggering its notes.
        // S3M uses the first command on a row; IT follows the same rule.
        for (const event of row) {
          if (event && (event.effect & 0xff) === 19 && ((event.parameter >> 4) & 0x0f) === 0x0e) {
            patternDelay = event.parameter & 0x0f;
            break;
          }
        }
      }
      const tickCount = timingSpeed * (patternDelay + 1);
      let rowTempo = timingTempo;
      let rowDuration = 0;
      for (let tick = 0; tick < tickCount; tick += 1) {
        // Maxmod processes Txy on nonzero ticks: T0x slides down and T1x
        // slides up once per tick, while T20+ sets BPM at tick zero.
        if (tick > 0) {
          for (const parameter of s3mItTempoSlides) {
            if (parameter < 0x10) rowTempo = Math.max(32, rowTempo - parameter);
            else rowTempo = Math.min(255, rowTempo + (parameter & 0x0f));
          }
        }
        rowDuration += maxmodGbaTickDurationSeconds(rowTempo);
      }
      const tickDuration = tickCount > 0 ? rowDuration / tickCount : maxmodGbaTickDurationSeconds(rowTempo);
      rowTempo = Math.max(32, Math.min(255, rowTempo));
      // Tracker rows can be shorter than 25 ms at high BPM / low speed.
      // Keep the Maxmod tick duration intact instead of stretching those rows
      // to a browser-oriented frame interval.
      const boundedRowDuration = Math.max(0, rowDuration);
      rowTickDurations.push(tickDuration);
      rowTickCounts.push(tickCount);
      rowDurations.push(boundedRowDuration);
      timingTempo = rowTempo;
      elapsed += boundedRowDuration;
      row.forEach((event, channel) => {
        if (!event || channel >= channels) return;
        const keyOff = isTrackerKeyOff(format, event);
        const effect = event.effect & 0xff;
        const parameter = event.parameter & 0xff;
        if (format === 'IT' && effect === 19 && ((parameter >> 4) & 0x0f) === 0x07) {
          const nnaValue = parameter & 0x0f;
          if (nnaValue >= 0x03 && nnaValue <= 0x06) itNnaModeChangesByChannel[channel].push({ row: rowIndex, mode: nnaValue - 0x03 });
        }
        const itInstrument = format === 'IT'
          ? itInstrumentMemoryForTiming[channel] = trackerItInstrumentMemoryAfterEvent(event, itInstrumentMemoryForTiming[channel])
          : 0;
        const hasMusicalNote = format === 'IT'
          ? trackerItEventTriggersNote(event, itInstrument)
          : hasTrackerMusicalNote(format, event);
        const tonePortamentoTarget = (format === 'MOD' || format === 'XM') && (effect === 3 || effect === 5) && event.note > 0
          || (format === 'S3M' || format === 'IT') && (effect === 7 || effect === 12) && hasMusicalNote;
        if ((hasMusicalNote && !tonePortamentoTarget) || keyOff) noteRowsByChannel[channel].push(rowIndex);
      });
    });
    const songDuration = elapsed;
    const itNnaModeAtRow = (channel: number, row: number) => {
      const changes = itNnaModeChangesByChannel[channel];
      let low = 0;
      let high = changes.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (changes[middle].row <= row) low = middle + 1;
        else high = middle;
      }
      return low > 0 ? changes[low - 1].mode : 0;
    };
    const channelGains: Array<GainNode | undefined> = [];
    const scheduledEnvelopeReleaseTimes = Array.from({ length: channels }, () => -1);
    const channelInstruments = Array.from({ length: channels }, () => 0);
    const channelVoices: Array<TrackerPreviewChannelVoice | undefined> = Array.from({ length: channels });
    const modPortamentoSpeeds = Array.from({ length: channels }, () => 0);
    const modPortamentoTargets: Array<number | undefined> = Array.from({ length: channels });
    const modChannelVolumes = Array.from({ length: channels }, () => 64);
    const itVolumeEnvelopeEnabled = Array.from({ length: channels }, () => true);
    const channelPans = Array.from({ length: channels }, (_, channel) => Math.max(-1, Math.min(1, Number(initialPans[channel]) || 0)));
    const xmPanSlideMemory = Array.from({ length: channels }, () => 0);
    const xmOldTremorParameterMemory = Array.from({ length: channels }, () => 0);
    const xmActivePanAmounts = Array.from({ length: channels }, (_, channel) => channelPans[channel]);
    const xmActiveSamplePans = Array.from({ length: channels }, () => 0);
    const xmActivePanners: Array<StereoPannerNode | undefined> = Array.from({ length: channels });
    const xmActivePanGains: Array<GainNode | undefined> = Array.from({ length: channels });
    const scheduleModPortamento = (voice: TrackerPreviewChannelVoice, targetPeriod: number, speed: number, ticks: number, tickDuration: number, rowDuration: number, when: number) => {
      if (speed <= 0) return;
      const boundedTarget = clampModPeriod(targetPeriod);
      let period = modPitchToPeriod(voice.pitchValue);
      voice.pitch.cancelScheduledValues(when);
      voice.pitch.setValueAtTime(voice.oscillator
        ? 440 * Math.pow(2, (voice.pitchValue - 49) / 12)
        : Math.pow(2, (voice.pitchValue - voice.rootNote) / 12), when);
      for (let tick = 1; tick <= ticks && period !== boundedTarget; tick += 1) {
        const delta = Math.min(speed, Math.abs(boundedTarget - period));
        period += Math.sign(boundedTarget - period) * delta;
        const pitch = 49 + 12 * Math.log2(428 / period);
        const time = when + Math.min(rowDuration, tick * tickDuration);
        voice.pitch.linearRampToValueAtTime(voice.oscillator
          ? 440 * Math.pow(2, (pitch - 49) / 12)
          : Math.pow(2, (pitch - voice.rootNote) / 12), time);
      }
      voice.pitchValue = 49 + 12 * Math.log2(428 / period);
    };
    const scheduleModVibrato = (voice: TrackerPreviewChannelVoice, speed: number, depth: number, phase: number, tickDuration: number, rowDuration: number, when: number) => {
      if (speed <= 0 || depth <= 0) return;
      const baseValue = voice.oscillator
        ? 440 * Math.pow(2, (voice.pitchValue - 49) / 12)
        : Math.pow(2, (voice.pitchValue - voice.rootNote) / 12);
      voice.pitch.cancelScheduledValues(when);
      voice.pitch.setValueAtTime(baseValue, when);
      const steps = Math.max(8, Math.min(64, Math.ceil(rowDuration / Math.max(0.005, tickDuration / 2))));
      for (let step = 1; step <= steps; step += 1) {
        const offset = (rowDuration * step) / steps;
        const tickPosition = offset / Math.max(0.0001, tickDuration);
        const semitones = Math.sin(phase + tickPosition * speed * (2 * Math.PI / 64)) * (depth / 16);
        voice.pitch.linearRampToValueAtTime(baseValue * Math.pow(2, semitones / 12), when + offset);
      }
    };
    const scheduleItFineVibrato = (voice: TrackerPreviewChannelVoice, speed: number, depth: number, phase: number, ticks: number, tickDuration: number, when: number, tickZeroActive = true) => {
      if (speed <= 0 || depth <= 0) return;
      const sampleRate = voice.sampleRate ?? 8_363;
      const rootNote = voice.rootNote ?? 61;
      const basePitch = voice.pitchValue;
      const baseValue = voice.oscillator
        ? 440 * Math.pow(2, (basePitch - 49) / 12)
        : Math.pow(2, (basePitch - rootNote) / 12) * trackerItMaxmodPlaybackRateScale(sampleRate, basePitch, rootNote);
      voice.pitch.cancelScheduledValues(when);
      for (let tick = 0; tick < ticks; tick += 1) {
        const hasVibrato = tick > 0 || tickZeroActive;
        const vibratoPhase = phase + (tick + (tickZeroActive ? 1 : 0)) * speed * (2 * Math.PI / 64);
        const targetPitch = hasVibrato
          ? trackerItMaxmodFineVibratoPitch(sampleRate, basePitch, rootNote, vibratoPhase, depth)
          : basePitch;
        voice.pitch.setValueAtTime(baseValue * Math.pow(2, (targetPitch - basePitch) / 12), when + tick * tickDuration);
      }
    };
    const scheduleItTremolo = (channel: number, gain: GainNode, baseGain: number, baseMaxmodVolume: number, parameter: number, ticks: number, tickDuration: number, when: number) => {
      const speed = (parameter >> 4) & 0x0f;
      const depth = parameter & 0x0f;
      if (speed <= 0 || depth <= 0 || baseMaxmodVolume <= 0) return;
      const startPhase = itTremoloPhases[channel];
      for (let tick = 0; tick < ticks; tick += 1) {
        const position = startPhase + tick * speed * 4;
        const maxmodVolume = trackerItMaxmodTremoloVolumeAt(baseMaxmodVolume, position, depth);
        gain.gain.setValueAtTime(Math.max(0.0001, baseGain * maxmodVolume / baseMaxmodVolume), when + tick * tickDuration);
      }
      itTremoloPhases[channel] = (startPhase + Math.max(0, ticks - 1) * speed * 4) & 0xff;
    };
    const schedulePeriodPortamento = (voice: TrackerPreviewChannelVoice, targetPeriod: number, speed: number, ticks: number, tickDuration: number, rowDuration: number, when: number, glissando = false) => {
      if (speed <= 0) return;
      // XM rootNote is a relative tuning offset, unlike S3M's reference note.
      // Use the same quantized rate as note-on and held-note effects so a tone
      // slide cannot jump to an unrelated frequency on transposed samples.
      const playbackValue = (pitch: number, periodValue?: number) => voice.oscillator
        ? 440 * Math.pow(2, (pitch - 49) / 12)
        : format === 'XM'
          ? trackerXmMaxmodPlaybackRateScale(voice.sampleRate ?? 8363, pitch + voice.rootNote - 48, 48)
          : format === 'S3M'
            ? trackerS3mMaxmodMixerStepQ12FromPeriod(periodValue ?? trackerS3mMaxmodAmigaPeriod(voice.sampleRate ?? 8363, pitch))
              / Math.max(1, trackerS3mMaxmodMixerStepQ12(voice.sampleRate ?? 8363, voice.s3mBasePitch ?? voice.pitchValue))
          : Math.pow(2, (pitch - voice.rootNote) / 12);
      const linearXm = format === 'XM' && voice.xmLinearPeriods === true;
      const s3mStartPeriod = format === 'S3M'
        ? voice.s3mPeriod ?? trackerS3mMaxmodAmigaPeriod(voice.sampleRate ?? 8363, voice.pitchValue)
        : 0;
      let period = linearXm
        ? trackerXmMaxmodLinearPeriod(voice.pitchValue + voice.rootNote - 48)
        : s3mStartPeriod || 1712 * Math.pow(2, (49 - voice.pitchValue) / 12);
      const startingPitch = glissando ? Math.round(voice.pitchValue) : voice.pitchValue;
      voice.pitch.cancelScheduledValues(when);
      voice.pitch.setValueAtTime(playbackValue(startingPitch, period), when);
      for (let tick = 1; tick < ticks && Math.abs(period - targetPeriod) > 0.001; tick += 1) {
        if (linearXm) {
          const direction = period < targetPeriod ? 'up' : 'down';
          const nextPeriod = trackerXmMaxmodLinearSlidePeriod(period, speed, direction);
          period = direction === 'up' ? Math.min(targetPeriod, nextPeriod) : Math.max(targetPeriod, nextPeriod);
        } else if (format === 'S3M') {
          const delta = speed << 4;
          period = targetPeriod > period
            ? Math.min(targetPeriod, period + delta)
            : Math.max(targetPeriod, period - delta);
        } else {
          period += Math.sign(targetPeriod - period) * Math.min(speed * (format === 'XM' ? 16 : 1), Math.abs(targetPeriod - period));
        }
        const pitch = linearXm
          ? trackerXmMaxmodLinearPitch(period) - (voice.rootNote - 48)
          : format === 'S3M' && s3mStartPeriod > 0
            ? voice.pitchValue + 12 * Math.log2(s3mStartPeriod / period)
          : 49 + 12 * Math.log2(1712 / period);
        const scheduledPitch = glissando ? Math.round(pitch) : pitch;
        const time = when + Math.min(rowDuration, tick * tickDuration);
        const pitchValue = playbackValue(scheduledPitch, period);
        if (glissando) voice.pitch.setValueAtTime(pitchValue, time);
        else voice.pitch.linearRampToValueAtTime(pitchValue, time);
      }
      voice.pitchValue = linearXm
        ? trackerXmMaxmodLinearPitch(period) - (voice.rootNote - 48)
        : format === 'S3M' && s3mStartPeriod > 0
          ? voice.pitchValue + 12 * Math.log2(s3mStartPeriod / period)
        : 49 + 12 * Math.log2(1712 / period);
      if (format === 'S3M') voice.s3mPeriod = period;
    };
    const scheduleItTonePortamento = (voice: TrackerPreviewChannelVoice, targetPitch: number, speed: number, ticks: number, tickDuration: number, when: number) => {
      if (speed <= 0) return;
      let currentPitch = voice.pitchValue;
      const sampleRate = voice.sampleRate ?? 8_363;
      const rootNote = voice.rootNote ?? 61;
      // IT's header flag selects either linear-frequency slides or Maxmod's
      // Amiga-period Gxx step. Keep the source module's mode through preview.
      const startPeriod = itLinearSlides ? 0 : trackerItMaxmodAmigaPeriod(sampleRate, currentPitch, rootNote);
      const targetPeriod = itLinearSlides ? 0 : trackerItMaxmodAmigaPeriod(sampleRate, targetPitch, rootNote);
      let period = startPeriod;
      voice.pitch.cancelScheduledValues(when);
      for (let tick = 0; tick < ticks && Math.abs(targetPitch - currentPitch) > 0.001; tick += 1) {
        if (itLinearSlides || !startPeriod || !targetPeriod) {
          currentPitch += Math.sign(targetPitch - currentPitch) * Math.min(speed / 16, Math.abs(targetPitch - currentPitch));
        } else {
          const delta = speed << 4;
          period = targetPeriod < period ? Math.max(targetPeriod, period - delta) : Math.min(targetPeriod, period + delta);
          currentPitch = voice.pitchValue + 12 * Math.log2(startPeriod / Math.max(1, period));
        }
        const pitchValue = voice.oscillator
          ? 440 * Math.pow(2, (currentPitch - 49) / 12)
          : Math.pow(2, (currentPitch - voice.rootNote) / 12);
        voice.pitch.setValueAtTime(pitchValue, when + tick * tickDuration);
      }
      voice.pitchValue = currentPitch;
    };
    const scheduleS3mPitchSlide = (voice: TrackerPreviewChannelVoice, effect: number, parameter: number, ticks: number, tickDuration: number, when: number) => {
      if (parameter <= 0 || (effect !== 5 && effect !== 6)) return;
      const basePitch = voice.s3mBasePitch ?? voice.pitchValue;
      const basePeriod = voice.s3mBasePeriod ?? trackerS3mMaxmodAmigaPeriod(voice.sampleRate ?? 8_363, basePitch);
      if (!basePeriod) return;
      let period = voice.s3mPeriod ?? basePeriod;
      voice.pitch.cancelScheduledValues(when);
      const baseMixerStep = trackerS3mMaxmodMixerStepQ12(voice.sampleRate ?? 8_363, basePitch);
      voice.pitch.setValueAtTime(voice.oscillator ? 440 * Math.pow(2, (voice.pitchValue - 49) / 12) : 1, when);
      const periodsByTick = trackerS3mMaxmodSlidePeriods(period, effect, parameter, ticks);
      for (let tick = 0; tick < periodsByTick.length; tick += 1) {
        period = periodsByTick[tick];
        const pitch = basePitch + 12 * Math.log2(basePeriod / Math.max(1, period));
        const mixerStep = trackerS3mMaxmodMixerStepQ12FromPeriod(period);
        const pitchValue = voice.oscillator
          ? 440 * Math.pow(2, (pitch - 49) / 12)
          : baseMixerStep > 0 ? mixerStep / baseMixerStep : 1;
        voice.pitch.setValueAtTime(pitchValue, when + tick * tickDuration);
      }
      voice.s3mBasePitch = basePitch;
      voice.s3mBasePeriod = basePeriod;
      voice.s3mPeriod = period;
      voice.pitchValue = basePitch + 12 * Math.log2(basePeriod / Math.max(1, period));
    };
    const scheduleItPitchSlide = (voice: TrackerPreviewChannelVoice, effect: number, parameter: number, ticks: number, tickDuration: number, when: number) => {
      if (parameter <= 0 || (effect !== 5 && effect !== 6)) return;
      const slideType = parameter >> 4;
      const fine = slideType === 0x0e || slideType === 0x0f;
      const slideValue = fine ? parameter & 0x0f : parameter;
      // Maxmod's IT E/F commands use the shared IT porta memory and MAS
      // period units. Regular slides run on ticks 1..N; E/F fine slides run
      // once on tick 0.
      const amount = slideValue << (fine ? 2 : 4);
      if (!amount) return;
      const basePitch = voice.pitchValue;
      const basePeriod = trackerItMaxmodAmigaPeriod(voice.sampleRate ?? 8_363, basePitch, voice.rootNote);
      let period = basePeriod;
      if (!period) return;
      voice.pitch.cancelScheduledValues(when);
      voice.pitch.setValueAtTime(voice.oscillator
        ? 440 * Math.pow(2, (voice.pitchValue - 49) / 12)
        : Math.pow(2, (voice.pitchValue - voice.rootNote) / 12)
          * trackerS3mMaxmodPlaybackRateScale(voice.sampleRate ?? 8_363, voice.pitchValue, voice.rootNote)
          / (voice.basePlaybackScale ?? 1), when);
      const firstTick = fine ? 0 : 1;
      const lastTick = fine ? 0 : ticks - 1;
      for (let tick = firstTick; tick <= lastTick; tick += 1) {
        period = effect === 5 ? Math.min(32768, period + amount) : Math.max(1, period - amount);
        const pitch = basePitch + 12 * Math.log2(basePeriod / period);
        const pitchValue = voice.oscillator
          ? 440 * Math.pow(2, (pitch - 49) / 12)
          : Math.pow(2, (pitch - voice.rootNote) / 12);
        voice.pitch.setValueAtTime(pitchValue, when + tick * tickDuration);
      }
      voice.pitchValue = basePitch + 12 * Math.log2(basePeriod / period);
    };
    const scheduleS3mVolumeSlide = (channel: number, parameter: number, ticks: number, tickDuration: number, when: number) => {
      if (format === 'IT') {
        const baseVolume = s3mBaseNoteVolumes[channel];
        for (let tick = 0; tick < ticks; tick += 1) {
          s3mActiveNoteVolumes[channel] = applyTrackerItVolumeSlideTick(s3mActiveNoteVolumes[channel], parameter, tick);
          const ratio = baseVolume > 0 ? s3mActiveNoteVolumes[channel] / baseVolume : 0;
          s3mVolumeSlideFaders[channel]?.gain.setValueAtTime(ratio, when + tick * tickDuration);
        }
        return;
      }
      const high = (parameter >> 4) & 0x0f;
      const low = parameter & 0x0f;
      let delta = 0;
      let firstTickOnly = false;
      let applyOnFirstAndEveryTick = false;
      if (parameter === 0x0f) {
        delta = -0x0f;
        applyOnFirstAndEveryTick = true;
      } else if (parameter === 0xf0) {
        delta = 0x0f;
        firstTickOnly = true;
      } else if (low === 0 && high > 0) {
        delta = high;
      } else if (high === 0 && low > 0) {
        delta = -low;
      } else if (low === 0x0f && high > 0 && high < 0x0f) {
        delta = high;
        firstTickOnly = true;
      } else if (high === 0x0f && low > 0 && low < 0x0f) {
        delta = -low;
        firstTickOnly = true;
      }
      if (delta === 0) return;
      const baseVolume = s3mBaseNoteVolumes[channel];
      const applyAt = (tick: number) => {
        s3mActiveNoteVolumes[channel] = Math.max(0, Math.min(64, s3mActiveNoteVolumes[channel] + delta));
        const ratio = baseVolume > 0 ? s3mActiveNoteVolumes[channel] / baseVolume : 0;
        s3mVolumeSlideFaders[channel]?.gain.setValueAtTime(ratio, when + tick * tickDuration);
      };
      if (firstTickOnly) applyAt(0);
      else {
        if (applyOnFirstAndEveryTick) applyAt(0);
        for (let tick = 1; tick < ticks; tick += 1) applyAt(tick);
      }
    };
    const scheduleAheadSeconds = 2.5;
    let playbackResumed = false;
    let initialScheduleError: unknown;
    let resolveInitialSchedule!: () => void;
    let initialScheduleReleased = false;
    const initialScheduleReady = new Promise<void>(resolve => { resolveInitialSchedule = resolve; });
    const releaseInitialSchedule = () => {
      if (initialScheduleReleased) return;
      initialScheduleReleased = true;
      resolveInitialSchedule();
    };
    const resumePlayback = () => {
      if (!this.context) return;
      void this.context.resume().catch(error => {
        initialScheduleError = error;
        if (generation === this.generation) {
          console.warn('Tracker preview could not resume its audio context.', error);
          this.stop();
        }
      });
    };
    const scheduleTask = (async () => {
      let schedulerChunkStartedAt = performance.now();
      for (const [rowIndex, row] of rows.entries()) {
        if (generation !== this.generation || !this.context) { releaseInitialSchedule(); return; }
        if (!playbackResumed && rowTimes[rowIndex] >= scheduleAheadSeconds) {
          playbackResumed = true;
          resumePlayback();
          releaseInitialSchedule();
        }
        const rowPlaybackTime = start + rowTimes[rowIndex];
        for (const fader of xmOldTremorFaders) fader.gain.setValueAtTime(1, rowPlaybackTime);
        while (playbackResumed && this.context && rowPlaybackTime > this.context.currentTime + scheduleAheadSeconds) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 25));
          if (generation !== this.generation || !this.context) { releaseInitialSchedule(); return; }
        }
      const currentSpeed = rowSpeeds[rowIndex];
      const rowDuration = rowDurations[rowIndex];
      const tickDuration = rowTickDurations[rowIndex];
      const currentTickCount = rowTickCounts[rowIndex];
      for (let channel = 0; channel < channels; channel += 1) {
        // Muted voices stay scheduled so a live unmute can restore this channel.
        const rowEvent = row[channel];
        if (!rowEvent) continue;
        // Maxmod starts a note-less MOD instrument change at the previous
        // pitch, but repeating the current instrument does not restart its voice.
        const event = format === 'MOD' && rowEvent.instrument > 0 && rowEvent.instrument !== channelInstruments[channel]
          && rowEvent.note <= 0 && channelVoices[channel]
          ? { ...rowEvent, note: channelVoices[channel]!.pitchValue }
          : rowEvent;
        if (format === 'IT') channelInstruments[channel] = trackerItInstrumentMemoryAfterEvent(event, channelInstruments[channel]);
        else if (event.instrument > 0) channelInstruments[channel] = event.instrument;
        const effect = event.effect & 0xff;
        let parameter = event.parameter & 0xff;
        const xmSlideVolumeAtRowStart = xmChannelSlideVolumes[channel];
        if (format === 'XM' && (effect === 1 || effect === 2)) {
          const memory = effect === 1 ? xmPitchUpMemory : xmPitchDownMemory;
          if (parameter > 0) memory[channel] = parameter;
          else parameter = memory[channel];
        }
        if ((format === 'XM' || format === 'MOD') && effect === 7) {
          const previous = xmTremoloMemory[channel];
          parameter = (parameter & 0xf0 || previous & 0xf0) | (parameter & 15 || previous & 15);
          xmTremoloMemory[channel] = parameter;
        }
        const hasItVolumeColumnLevel = format === 'IT'
          && event.volume <= 64
          && (event.volumePresent || event.volume > 0);
        if (format === 'IT' && (effect === 8 || effect === 21)) {
          const speed = (parameter >> 4) & 0x0f;
          const depth = parameter & 0x0f;
          if (speed > 0) itVibratoSpeedMemory[channel] = speed;
          if (depth > 0) itVibratoDepthMemory[channel] = depth;
        }
        const itVibratoPhaseAtRow = itVibratoPhases[channel];
        const itFineVolumeEffect = format === 'IT' && effect === 19 && ((parameter >> 4) === 0 || (parameter >> 4) === 1);
        if (format === 'XM' && effect === 0x0e) {
          const command = parameter >> 4;
          const value = parameter & 0x0f;
          if (command === 0x04) xmVibratoWaveforms[channel] = value;
          if (command === 0x07) xmTremoloWaveforms[channel] = value;
        }
        if (format === 'IT' && effect === 19) {
          const command = parameter >> 4;
          const value = parameter & 0x0f;
          if (command === 0x07 && (value === 0x07 || value === 0x08)) itVolumeEnvelopeEnabled[channel] = value === 0x08;
        }
        const when = start + rowTimes[rowIndex];
        if (format === 'XM' && effect === 0x14) {
          xmOldTremorParameterMemory[channel] = trackerXmOldTremorParameterAt(xmOldTremorParameterMemory[channel], parameter);
          const tremorParameter = xmOldTremorParameterMemory[channel];
          let state = xmOldTremorStates[channel];
          const fader = xmOldTremorFaders[channel];
          for (let tick = 0; tick < currentTickCount; tick += 1) {
            const step = trackerXmOldTremorTick(state, tremorParameter, tick);
            state = step.state;
            if (tick > 0) fader?.gain.setValueAtTime(step.cutVolume ? 0 : 1, when + tick * tickDuration);
          }
          xmOldTremorStates[channel] = state;
        }
        if (format === 'MOD' && event.instrument > 0) {
          // MOD stores the sample header volume as the channel's default
          // volume. Maxmod reloads it on instrument selection before effects.
          const selectedSample = samples.get(event.instrument);
          modChannelVolumes[channel] = selectedSample?.volume ?? 64;
          if (event.note <= 0 && channelVoices[channel]) {
            channelVoices[channel]!.defaultVolume = selectedSample?.volume ?? 64;
          }
        }
        if (format === 'MOD' && effect === 0x04 && parameter > 0) {
          const vibratoSpeed = (parameter >> 4) & 0x0f;
          const vibratoDepth = parameter & 0x0f;
          if (vibratoSpeed > 0) modVibratoSpeedMemory[channel] = vibratoSpeed;
          if (vibratoDepth > 0) modVibratoDepthMemory[channel] = vibratoDepth;
        }
        const modVibratoEffect = format === 'MOD' && (effect === 0x04 || effect === 0x06);
        const modVibratoSpeed = modVibratoSpeedMemory[channel];
        const modVibratoDepth = modVibratoDepthMemory[channel];
        const modVibratoPhaseAtRow = modVibratoPhase[channel];
        if (modVibratoEffect) {
          modVibratoPhase[channel] = (modVibratoPhaseAtRow + currentTickCount * modVibratoSpeed * (2 * Math.PI / 64)) % (2 * Math.PI);
        }
        if (format === 'S3M' && (effect === 5 || effect === 6) && parameter > 0) s3mPitchSlideMemory[channel] = parameter;
        const s3mPitchSlideParameter = parameter || s3mPitchSlideMemory[channel];
        if (format === 'IT' && (effect === 5 || effect === 6) && parameter > 0) itPitchSlideMemory[channel] = parameter;
        const itPitchSlideParameter = parameter || itPitchSlideMemory[channel];
        const s3mVibratoPhaseAtRow = s3mVibratoPhase[channel];
        const s3mVibratoParameterDepth = format === 'S3M' && effect === 8 ? parameter & 0x0f : 0;
        if (format === 'S3M' && (effect === 8 || effect === 11)) {
          if (effect === 8) {
            const speed = (parameter >> 4) & 0x0f;
            if (speed > 0) s3mVibratoSpeed[channel] = speed * 4;
            if (s3mVibratoParameterDepth > 0) s3mVibratoDepth[channel] = s3mVibratoParameterDepth * 4;
          }
          const phaseSteps = currentTickCount - (s3mVibratoParameterDepth > 0 ? 0 : 1);
          s3mVibratoPhase[channel] = (s3mVibratoPhaseAtRow + Math.max(0, phaseSteps) * s3mVibratoSpeed[channel]) & 0xff;
        }
        if ((format === 'XM' || format === 'MOD') && effect === 8) {
          const activePan = parameter <= 128 ? (parameter - 128) / 128 : (parameter - 128) / 127;
          channelPans[channel] = activePan - xmActiveSamplePans[channel];
          xmActivePanAmounts[channel] = activePan;
          xmActivePanners[channel]?.pan.setValueAtTime(trackerPreviewPanPosition(activePan), when);
          xmActivePanGains[channel]?.gain.setValueAtTime(trackerPreviewPanCompensationGain(activePan), when);
        }
        if (format === 'XM' && effect === 0x0e && (parameter >> 4) === 0x08) {
          const panNibble = parameter & 0x0f;
          const channelPan = trackerPanningNibbleToNormalized(panNibble);
          channelPans[channel] = Math.max(-1, Math.min(1, channelPan));
          const activePanner = xmActivePanners[channel];
          const activePanGain = xmActivePanGains[channel];
          if (activePanner && activePanGain) {
            const activePan = Math.max(-1, Math.min(1, channelPans[channel] + xmActiveSamplePans[channel]));
            xmActivePanAmounts[channel] = activePan;
            activePanner.pan.setValueAtTime(trackerPreviewPanPosition(activePan), when);
            activePanGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(activePan), when);
          }
        }
        if (format === 'MOD' && effect === 0x0e && (parameter >> 4) === 0x08) {
          const panNibble = parameter & 0x0f;
          const channelPan = trackerPanningNibbleToNormalized(panNibble);
          channelPans[channel] = Math.max(-1, Math.min(1, channelPan));
          const activePanner = xmActivePanners[channel];
          const activePanGain = xmActivePanGains[channel];
          if (activePanner && activePanGain) {
            activePanner.pan.setValueAtTime(trackerPreviewPanPosition(channelPans[channel]), when);
            activePanGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(channelPans[channel]), when);
          }
        }
        if (format === 'XM' && effect === 0x0e && (parameter >> 4) === 0x03) {
          xmGlissandoEnabled[channel] = (parameter & 0x0f) !== 0;
        }
        if ((format === 'S3M' || format === 'IT') && effect === 19 && (parameter >> 4) === 0x08) {
          const panNibble = parameter & 0x0f;
          const channelPan = format === 'IT' ? trackerItExtendedPanToNormalized(panNibble) : trackerPanningNibbleToNormalized(panNibble);
          channelPans[channel] = Math.max(-1, Math.min(1, channelPan));
          const activePanner = xmActivePanners[channel];
          const activePanGain = xmActivePanGains[channel];
          if (activePanner && activePanGain) {
            const activePan = Math.max(-1, Math.min(1, channelPans[channel] + xmActiveSamplePans[channel]));
            xmActivePanAmounts[channel] = activePan;
            activePanner.pan.setValueAtTime(trackerPreviewPanPosition(activePan), when);
            activePanGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(activePan), when);
          }
        }
        if ((format === 'IT' || format === 'S3M') && effect === 24) {
          const channelPan = trackerItPanByteToNormalized(parameter);
          channelPans[channel] = channelPan;
          const activePanner = xmActivePanners[channel];
          const activePanGain = xmActivePanGains[channel];
          if (activePanner && activePanGain) {
            const activePan = Math.max(-1, Math.min(1, channelPan + xmActiveSamplePans[channel]));
            xmActivePanAmounts[channel] = activePan;
            activePanner.pan.setValueAtTime(trackerPreviewPanPosition(activePan), when);
            activePanGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(activePan), when);
          }
        }
        if (format === 'XM' && effect === 0x04 && parameter > 0) {
          const speed = (parameter >> 4) & 0x0f;
          const depth = parameter & 0x0f;
          if (speed > 0) xmVibratoSpeedMemory[channel] = speed;
          if (depth > 0) xmVibratoDepthMemory[channel] = depth;
        }
        const xmVibratoParameter = format === 'XM' && (effect === 0x04 || effect === 0x06)
          ? (xmVibratoSpeedMemory[channel] << 4) | xmVibratoDepthMemory[channel] : parameter;
        const xmVibratoSpeed = format === 'XM' && (effect === 0x04 || effect === 0x06)
          ? (xmVibratoParameter >> 4) & 0x0f
          : 0;
        const xmVibratoEffect = format === 'XM' && (effect === 0x04 || effect === 0x06);
        const xmNoteTrigger = format === 'XM' && event.note > 0 && event.note < 97 && !((effect === 3 || effect === 5) && channelVoices[channel]);
        if (xmNoteTrigger) {
          if ((xmVibratoWaveforms[channel] & 0x04) === 0) xmVibratoPhases[channel] = 0;
          if ((xmTremoloWaveforms[channel] & 0x04) === 0) xmTremoloPhases[channel] = 0;
        }
        const xmVibratoPhaseAtRow = xmVibratoPhases[channel];
        const xmTremoloPhaseAtRow = xmTremoloPhases[channel];
        const xmPhaseStep = 2 * Math.PI / 64;
        if (xmVibratoEffect && xmVibratoSpeed > 0) {
          xmVibratoPhases[channel] = (xmVibratoPhaseAtRow + currentTickCount * xmVibratoSpeed * xmPhaseStep) % (2 * Math.PI);
        }
        if (format === 'XM' && effect === 0x07) {
          const speed = (parameter >> 4) & 0x0f;
          if (speed > 0) xmTremoloPhases[channel] = (xmTremoloPhaseAtRow + currentTickCount * speed * xmPhaseStep) % (2 * Math.PI);
        }
        const xmVolumeSlideEffect = format === 'XM' && (effect === 0x05 || effect === 0x06 || effect === 0x0a);
        if (xmVolumeSlideEffect) {
          if (parameter > 0) xmVolumeSlideMemory[channel] = parameter;
          const slideParameter = parameter || xmVolumeSlideMemory[channel];
          const slideUp = (slideParameter >> 4) & 0x0f;
          const slideDown = slideParameter & 0x0f;
          const slideAmount = slideUp > 0 ? slideUp : -slideDown;
          if (slideAmount !== 0) {
            for (let tick = 1; tick < currentTickCount; tick += 1) {
              xmChannelSlideVolumes[channel] = Math.max(0, Math.min(64, xmChannelSlideVolumes[channel] + slideAmount));
              channelFaders[channel]?.gain.setValueAtTime(xmChannelSlideVolumes[channel] / 64, when + tick * tickDuration);
            }
          }
        }
        if (format === 'XM' && effect === 0x19) {
          if (parameter > 0) xmPanSlideMemory[channel] = parameter;
          const slideParameter = parameter || xmPanSlideMemory[channel];
          const slideRight = (slideParameter >> 4) & 0x0f;
          const slideLeft = slideParameter & 0x0f;
          const slideAmount = (slideRight > 0 ? slideRight : -slideLeft) * (2 / 255);
          const activePanner = xmActivePanners[channel];
          const activePanGain = xmActivePanGains[channel];
          if (slideAmount !== 0 && event.note <= 0 && activePanner && activePanGain) {
            activePanner.pan.setValueAtTime(trackerPreviewPanPosition(xmActivePanAmounts[channel]), when);
            activePanGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(xmActivePanAmounts[channel]), when);
            for (let tick = 1; tick < currentTickCount; tick += 1) {
              xmActivePanAmounts[channel] = Math.max(-1, Math.min(1, xmActivePanAmounts[channel] + slideAmount));
              activePanner.pan.setValueAtTime(trackerPreviewPanPosition(xmActivePanAmounts[channel]), when + tick * tickDuration);
              activePanGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(xmActivePanAmounts[channel]), when + tick * tickDuration);
            }
            channelPans[channel] = Math.max(-1, Math.min(1, xmActivePanAmounts[channel] - xmActiveSamplePans[channel]));
          }
        }
        const itChannelVolume = format === 'IT' && effect === 13 ? trackerItChannelVolumeSet(parameter) : null;
        if (((format === 'S3M' && effect === 13 && parameter <= 64) || itChannelVolume !== null)) {
          const channelVolume = itChannelVolume ?? parameter;
          channelFaders[channel]?.gain.setValueAtTime(channelVolume / 64, when);
          if (format === 'IT') itChannelVolumes[channel] = channelVolume;
        }
        if (format === 'IT' && effect === 14) {
          if (parameter > 0) itChannelVolumeSlideMemory[channel] = parameter;
          const slideParameter = parameter || itChannelVolumeSlideMemory[channel];
          for (let tick = 0; tick < currentTickCount; tick += 1) {
            itChannelVolumes[channel] = applyTrackerItVolumeSlideTick(itChannelVolumes[channel], slideParameter, tick);
            channelFaders[channel]?.gain.setValueAtTime(itChannelVolumes[channel] / 64, when + tick * tickDuration);
          }
        }
        if (format === 'XM' && effect === 0x10 && parameter <= 0x40) {
          xmGlobalVolume = parameter;
          xmGlobalVolumeGain.gain.setValueAtTime(xmGlobalVolume / 64, when);
        } else if (format === 'XM' && effect === 0x11) {
          if (parameter > 0) xmGlobalVolumeSlideMemory = parameter;
          const slideParameter = parameter || xmGlobalVolumeSlideMemory;
          const slideUp = (slideParameter >> 4) & 0x0f;
          const slideDown = slideParameter & 0x0f;
          const slideAmount = slideUp > 0 ? slideUp : -slideDown;
          if (slideAmount !== 0) {
            for (let tick = 1; tick < currentTickCount; tick += 1) {
              xmGlobalVolume = Math.max(0, Math.min(64, xmGlobalVolume + slideAmount));
              xmGlobalVolumeGain.gain.setValueAtTime(xmGlobalVolume / 64, when + tick * tickDuration);
            }
          }
        }
        if (format === 'MOD' && effect === 3 && parameter > 0) modPortamentoSpeeds[channel] = parameter;
        if (format === 'XM' && effect === 3 && parameter > 0) xmTonePortamentoSpeeds[channel] = parameter;
        if ((format === 'S3M' || format === 'IT') && effect === 7 && parameter > 0) s3mTonePortamentoSpeeds[channel] = parameter;
        const modVolumeStart = format === 'MOD' && event.note > 0 && event.instrument > 0
          ? Math.max(0, Math.min(64, samples.get(channelInstruments[channel] ?? event.instrument)?.volume ?? 64))
          : modChannelVolumes[channel];
        if (format === 'MOD' && event.note > 0 && event.instrument > 0) modChannelVolumes[channel] = modVolumeStart;
        const modVolumeRow = format === 'MOD'
          ? trackerModVolumeRow(modVolumeStart, effect, parameter, currentTickCount)
          : { rowStartVolume: modVolumeStart, endingVolume: modVolumeStart, steps: [] };
        const modVolumeAtRowStart = modVolumeRow.rowStartVolume;
        const modVolumeSteps = modVolumeRow.steps.map(({ tick, value }) => ({ time: tick * tickDuration, value }));
        if (format === 'MOD') modChannelVolumes[channel] = modVolumeRow.endingVolume;
        if ((format === 'S3M' || format === 'IT') && effect === 22 && parameter <= globalVolumeMaximum) {
          globalVolume = format === 'IT' ? trackerItGlobalVolumeSet(parameter, globalVolumeMaximum) : parameter;
          trackerGlobalVolumeGain.gain.setValueAtTime(globalVolume / globalVolumeMaximum, when);
        }
        if ((format === 'S3M' || format === 'IT') && effect === 23) {
          if (parameter > 0) globalVolumeSlideMemory = parameter;
          const slideParameter = parameter || globalVolumeSlideMemory;
          for (let tick = 0; tick < currentTickCount; tick += 1) {
            globalVolume = applyTrackerItVolumeSlideTick(globalVolume, slideParameter, tick, globalVolumeMaximum);
            trackerGlobalVolumeGain.gain.setValueAtTime(globalVolume / globalVolumeMaximum, when + tick * tickDuration);
          }
        }
        const sampleOffsetCommand = format === 'XM' || format === 'MOD' ? effect === 0x09 : effect === 0x0f; // 9xx / Oxx
        const sampleOffsetFrames = sampleOffsetCommand ? parameter * 256 : 0;
        const extendedEffect = format === 'XM' || format === 'MOD' ? effect === 0x0e : effect === 19;
        const extendedCommand = extendedEffect ? parameter >> 4 : 0;
        const extendedValue = extendedEffect ? parameter & 0x0f : 0;
        const noteDelay = extendedCommand === 0x0d ? Math.min(rowDuration * 0.9, extendedValue * tickDuration) : 0;
        const channelNoteRows = noteRowsByChannel[channel];
        let low = 0;
        let high = channelNoteRows.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (channelNoteRows[middle] <= rowIndex) low = middle + 1;
          else high = middle;
        }
        const nextEventRow = low < channelNoteRows.length ? channelNoteRows[low] : -1;
        const nextChannelEvent = nextEventRow >= 0 ? rows[nextEventRow]?.[channel] : undefined;
        const nextEventIsMusicalItNote = format === 'IT' && nextEventRow >= 0 && nextChannelEvent
          && hasTrackerMusicalNote('IT', nextChannelEvent);
        const nextEventNnaAction = nextEventIsMusicalItNote ? itNnaModeAtRow(channel, nextEventRow) : 0;
        const nextEventNnaOff = nextEventIsMusicalItNote && nextEventNnaAction === 2;
        const nextEventNnaFade = nextEventIsMusicalItNote && nextEventNnaAction === 3;
        const nextEventIsNoteFade = format === 'IT' && nextChannelEvent?.note === 246;
        const nextEventIsKeyOff = format === 'IT'
          ? nextChannelEvent?.note === 255 || nextChannelEvent?.note === 246 || nextEventNnaOff
          : isTrackerKeyOff(format, nextChannelEvent);
        const nextNoteTime = nextEventRow >= 0 ? rowTimes[nextEventRow] : songDuration;
        let duration = Math.max(0.005, nextNoteTime - rowTimes[rowIndex] - noteDelay);
        const nextEventStartsNewItNote = Boolean(nextEventIsMusicalItNote);
        const nextEventContinuesItVoice = nextEventStartsNewItNote && nextEventNnaAction === 1;
        const nextEventFadesItVoice = nextEventStartsNewItNote && nextEventNnaAction === 3;
        if (nextEventContinuesItVoice || nextEventFadesItVoice && !(channelVoices[channel]?.fadeout ?? 0)) {
          duration = Math.max(duration, songDuration - rowTimes[rowIndex] - noteDelay);
        }
        const noteCut = extendedCommand === 0x0c ? Math.min(duration, extendedValue * tickDuration) : duration;
        // XM E9x and Maxmod's normalized MOD E9x / IT S2x retrigger on their
        // tracker-specific schedules. S3M/IT Qxy is limited to this row's ticks.
        const oldRetrigger = format === 'MOD' && effect === 0x0e && extendedCommand === 0x09
          || format === 'IT' && effect === 19 && extendedCommand === 0x02;
        const retriggerValue = format === 'XM'
          ? (extendedCommand === 0x09 ? extendedValue : 0)
          : oldRetrigger ? extendedValue : (effect === 0x11 ? parameter & 0x0f : 0); // MOD E9x, IT S2x and Qxy in S3M/IT
        const retriggerInterval = retriggerValue > 0
          ? Math.max(0.005, retriggerValue * tickDuration)
          : 0;
        const rowRetrigger = (format === 'IT' || format === 'S3M') && effect === 17;
        const retriggerCount = retriggerInterval > 0
          ? oldRetrigger
            ? Math.floor(Math.max(0, currentTickCount - 1) / retriggerValue)
            : rowRetrigger
              ? trackerMaxmodRowRetriggerCount(retriggerValue, currentTickCount)
            : Math.max(1, Math.floor(noteCut / retriggerInterval))
          : 0;
        const keyOff = isTrackerKeyOff(format, event);
        const hasMusicalNote = format === 'IT'
          ? trackerItEventTriggersNote(event, channelInstruments[channel])
          : hasTrackerMusicalNote(format, event);
        const musicalNote = format === 'S3M' ? trackerStoredNoteToPitch('S3M', event.note)
          : format === 'IT' && hasMusicalNote ? trackerStoredNoteToPitch('IT', event.note) : event.note;
        const modFineSlidePeriod = format === 'MOD' && extendedEffect && (extendedCommand === 0x01 || extendedCommand === 0x02)
          ? (extendedCommand === 0x01 ? -extendedValue : extendedValue)
          : 0;
        const modPeriod = format === 'MOD' && musicalNote > 0
          ? clampModPeriod((event.period && event.period > 0 ? event.period : modPitchToPeriod(musicalNote)) + modFineSlidePeriod)
          : 0;
        if (!hasMusicalNote || keyOff) {
          if (format === 'XM' && !keyOff && channelVoices[channel]) {
            const voice = channelVoices[channel]!;
            const pitchValue = (pitch: number) => voice.oscillator ? 440 * Math.pow(2, (pitch - 49) / 12)
              : trackerXmMaxmodPlaybackRateScale(voice.sampleRate ?? 8363, pitch + voice.rootNote - 48, 48);
            // Each row owns its modulation; replace the previous row's automation
            // without retriggering the long note or restarting its sample.
            const slide = effect === 1 ? parameter / 8 : effect === 2 ? -parameter / 8
              : effect === 14 && (extendedCommand === 1 || extendedCommand === 2) ? (extendedCommand === 1 ? 1 : -1) * extendedValue / 16
                : effect === 33 && (parameter >> 4 === 1 || parameter >> 4 === 2) ? (parameter >> 4 === 1 ? 1 : -1) * (parameter & 15) / 64 : 0;
            const modulatesPitch = slide !== 0 || xmVibratoEffect || effect === 0 && parameter > 0;
            if (modulatesPitch || voice.rowPitchModulated) {
              voice.pitch.cancelScheduledValues(when);
              voice.pitch.setValueAtTime(pitchValue(voice.pitchValue), when);
            }
            if (modulatesPitch) for (let tick = 0; tick < currentTickCount; tick += 1) {
              let pitch = voice.pitchValue + slide * ((effect === 1 || effect === 2) ? tick / Math.max(1, currentTickCount - 1) : 1);
              if (effect === 0 && parameter > 0) pitch = trackerXmArpeggioPitchAtTick(pitch, parameter, tick);
              if (xmVibratoEffect) pitch += xmWaveform(xmVibratoWaveforms[channel],
                xmVibratoPhaseAtRow + tick * xmVibratoSpeed * xmPhaseStep, true) * ((xmVibratoParameter & 15) / 16);
              voice.pitch.setValueAtTime(pitchValue(pitch), when + tick * tickDuration);
            }
            voice.pitchValue += slide;
            voice.rowPitchModulated = modulatesPitch;
            const level = effect === 12 ? Math.min(64, parameter)
              : event.volume >= 0x10 && event.volume <= 0x50 ? event.volume - 0x10 : undefined;
            if (level !== undefined) {
              xmActiveNoteVolumes[channel] = level;
              const ratio = (voice.baseVolume ?? 64) > 0 ? level / (voice.baseVolume ?? 64) : 0;
              xmChannelSlideVolumes[channel] = ratio * 64;
              channelFaders[channel]?.gain.setValueAtTime(ratio, when);
            } else {
              if (voice.rowVolumeModulated || effect === 7) channelFaders[channel]?.gain.setValueAtTime(xmSlideVolumeAtRowStart / 64, when);
              if (effect === 7) for (let tick = 0; tick < currentTickCount; tick += 1) {
                const modulation = Math.max(0, 1 + ((parameter & 15) / 16) * xmWaveform(xmTremoloWaveforms[channel],
                  xmTremoloPhaseAtRow + tick * (parameter >> 4) * xmPhaseStep, false));
                channelFaders[channel]?.gain.setValueAtTime(xmSlideVolumeAtRowStart / 64 * modulation, when + tick * tickDuration);
              }
            }
            voice.rowVolumeModulated = effect === 7;
          }
          if (format === 'IT' && itFineVolumeEffect) {
            const baseVolume = hasItVolumeColumnLevel ? event.volume : itNoteVolumes[channel];
            const nextVolume = applyTrackerItFineVolume(baseVolume, parameter);
            itNoteVolumes[channel] = nextVolume;
            if (channelVoices[channel]) {
              s3mActiveNoteVolumes[channel] = nextVolume;
              const originalVolume = s3mBaseNoteVolumes[channel];
              s3mVolumeSlideFaders[channel]?.gain.setValueAtTime(originalVolume > 0 ? nextVolume / originalVolume : 0, when);
            }
          }
          if (format === 'S3M' && !keyOff && !hasMusicalNote && channelVoices[channel]) {
            const selectedVolume = event.volumePresent && event.volume <= 64
              ? event.volume
              : event.note <= 0 && event.instrument > 0 ? channelVoices[channel]!.defaultVolume : undefined;
            if (selectedVolume !== undefined) {
              s3mVolumeColumnFaders[channel]?.gain.setValueAtTime(selectedVolume / 64, when);
              s3mVolumeSlideFaders[channel]?.gain.setValueAtTime(1, when);
              s3mActiveNoteVolumes[channel] = selectedVolume;
              s3mBaseNoteVolumes[channel] = selectedVolume;
            }
          }
          if ((format === 'S3M' || format === 'IT') && !keyOff && channelVoices[channel] && (effect === 4 || effect === 11)) {
            // Dxy and Kxy continue changing the active channel volume even
            // when the row does not retrigger a note.
            scheduleS3mVolumeSlide(channel, parameter, currentTickCount, tickDuration, when);
          }
          if (format === 'IT' && !keyOff && effect === 21 && channelVoices[channel]) {
            const speed = itVibratoSpeedMemory[channel];
            const depth = itVibratoDepthMemory[channel];
            scheduleItFineVibrato(channelVoices[channel]!, speed, depth, itVibratoPhaseAtRow, currentTickCount, tickDuration, when);
            if (speed > 0 && depth > 0) {
              itVibratoPhases[channel] = (itVibratoPhaseAtRow + currentTickCount * speed * (2 * Math.PI / 64)) % (2 * Math.PI);
            }
          }
          if (format === 'IT' && !keyOff && (effect === 8 || effect === 11) && channelVoices[channel]) {
            const speed = itVibratoSpeedMemory[channel];
            const depth = itVibratoDepthMemory[channel];
            const tickZeroActive = effect !== 8 || (parameter & 0x0f) > 0;
            scheduleItFineVibrato(channelVoices[channel]!, speed, depth, itVibratoPhaseAtRow, currentTickCount, tickDuration, when, tickZeroActive);
            if (speed > 0 && depth > 0) {
              const vibratoTicks = tickZeroActive ? currentTickCount : Math.max(0, currentTickCount - 1);
              itVibratoPhases[channel] = (itVibratoPhaseAtRow + vibratoTicks * speed * (2 * Math.PI / 64)) % (2 * Math.PI);
            }
          }
          if (format === 'IT' && !keyOff && effect === 18 && channelVoices[channel]) {
            const voice = channelVoices[channel]!;
            const baseVolume = Math.max(0, Math.min(128, Math.trunc((itNoteVolumes[channel] * voice.sampleVolume * voice.channelVolume) / 32)));
            const baseGain = trackerMaxmodGbaOutputGain(trackerMaxmodGbaMixerVolume({
              sampleGlobalVolume: voice.maxmodSampleGlobalVolume ?? 64,
              instrumentGlobalVolume: voice.maxmodInstrumentGlobalVolume ?? 128,
              channelVolume: 64,
              channelBaseVolume: itNoteVolumes[channel],
              moduleGlobalVolume: 128,
              xmGlobalVolume: false,
              fade: maxmodMasterVolume,
              moduleVolume: maxmodMasterVolume,
            }), 'IT') * voice.channelVolume;
            scheduleItTremolo(channel, voice.gain, baseGain, baseVolume, parameter, currentTickCount, tickDuration, when);
          }
          if (format === 'MOD' && channelVoices[channel] && channelGains[channel]) {
            const voice = channelVoices[channel]!;
            const gain = channelGains[channel]!;
            const modulatesPitch = effect === 0 && parameter > 0 || effect === 1 || effect === 2 || modVibratoEffect;
            const valueAt = (pitch: number) => voice.oscillator ? 440 * Math.pow(2, (pitch - 49) / 12)
              : trackerModMaxmodPlaybackRateScale(voice.sampleRate ?? 8363, pitch, voice.rootNote, 0);
            if (modulatesPitch || voice.rowPitchModulated) {
              voice.pitch.cancelScheduledValues(when);
              voice.pitch.setValueAtTime(valueAt(voice.pitchValue), when);
            }
            if (effect === 0 && parameter > 0) for (let tick = 1; tick < currentTickCount; tick += 1) {
              const offset = tick % 3 === 1 ? parameter >> 4 : tick % 3 === 2 ? parameter & 15 : 0;
              voice.pitch.setValueAtTime(valueAt(voice.pitchValue + offset), when + tick * tickDuration);
            }
            if (effect === 1 || effect === 2) {
              let period = modPitchToPeriod(voice.pitchValue);
              for (let tick = 1; tick < currentTickCount; tick += 1) {
                period = clampModPeriod(period + (effect === 1 ? -parameter : parameter));
                voice.pitch.setValueAtTime(valueAt(modPeriodToPitch(period)), when + tick * tickDuration);
              }
              voice.pitchValue = modPeriodToPitch(period);
            }
            voice.rowPitchModulated = modulatesPitch;
            if (voice.rowVolumeModulated || effect === 7) {
              const baseGain = modVoiceGainAtVolume(modVolumeAtRowStart, voice.channelVolume, laneMixScale);
              gain.gain.setValueAtTime(baseGain, when);
              if (effect === 7) for (let tick = 0; tick < currentTickCount; tick += 1) {
                const phase = tick * (parameter >> 4) * 2 * Math.PI / 64;
                gain.gain.setValueAtTime(Math.max(0.0001, baseGain * (1 - (parameter & 15) / 16 * (0.5 + 0.5 * Math.sin(phase)))), when + tick * tickDuration);
              }
            }
            voice.rowVolumeModulated = effect === 7;
            if (effect === 0x0c || event.instrument > 0) {
              const targetGain = modVoiceGainAtVolume(modVolumeAtRowStart, voice.channelVolume, laneMixScale);
              // A newly triggered voice may already have release automation
              // scheduled through the end of its row. A later Cxx replaces
              // the channel level, so discard those stale gain events too.
              if (effect === 0x0c) gain.gain.cancelScheduledValues(when);
              gain.gain.setValueAtTime(targetGain, when);
            }
            for (const step of modVolumeSteps) gain.gain.setValueAtTime(modVoiceGainAtVolume(step.value, voice.channelVolume, laneMixScale), when + step.time);
            if (modFineSlidePeriod !== 0) {
              const nextPitch = modPeriodToPitch(clampModPeriod(modPitchToPeriod(voice.pitchValue) + modFineSlidePeriod));
              voice.pitch.cancelScheduledValues(when);
              voice.pitch.setValueAtTime(voice.oscillator
                ? 440 * Math.pow(2, (nextPitch - 49) / 12)
                : Math.pow(2, (nextPitch - voice.rootNote) / 12), when);
              voice.pitchValue = nextPitch;
            }
            if ((effect === 3 || effect === 5) && modPortamentoTargets[channel] !== undefined) {
              const speed = effect === 5 ? modPortamentoSpeeds[channel] : parameter || modPortamentoSpeeds[channel];
              scheduleModPortamento(voice, modPortamentoTargets[channel]!, speed, currentTickCount, tickDuration, rowDuration, when);
            }
            if (modVibratoEffect) scheduleModVibrato(voice, modVibratoSpeed, modVibratoDepth, modVibratoPhaseAtRow, tickDuration, rowDuration, when);
          }
          if (format === 'XM' && (effect === 3 || effect === 5) && channelVoices[channel] && xmTonePortamentoTargets[channel] !== undefined) {
            schedulePeriodPortamento(channelVoices[channel]!, xmTonePortamentoTargets[channel]!, (effect === 5 ? xmTonePortamentoSpeeds[channel] : parameter || xmTonePortamentoSpeeds[channel]), currentTickCount, tickDuration, rowDuration, when, xmGlissandoEnabled[channel]);
          }
          if ((format === 'S3M' || format === 'IT') && effect === 7 && channelVoices[channel] && s3mTonePortamentoTargets[channel] !== undefined) {
            if (format === 'IT') {
              const targetPitch = 49 + 12 * Math.log2(1712 / s3mTonePortamentoTargets[channel]!);
              scheduleItTonePortamento(channelVoices[channel]!, targetPitch, parameter || s3mTonePortamentoSpeeds[channel], currentTickCount, tickDuration, when);
            } else {
              schedulePeriodPortamento(channelVoices[channel]!, s3mTonePortamentoTargets[channel]!, parameter || s3mTonePortamentoSpeeds[channel], currentTickCount, tickDuration, rowDuration, when);
            }
          }
          if ((format === 'S3M' || format === 'IT') && effect === 12 && channelVoices[channel]) {
            if (s3mTonePortamentoTargets[channel] !== undefined) {
              if (format === 'IT') {
                const targetPitch = 49 + 12 * Math.log2(1712 / s3mTonePortamentoTargets[channel]!);
                scheduleItTonePortamento(channelVoices[channel]!, targetPitch, s3mTonePortamentoSpeeds[channel], currentTickCount, tickDuration, when);
              } else {
                schedulePeriodPortamento(channelVoices[channel]!, s3mTonePortamentoTargets[channel]!, s3mTonePortamentoSpeeds[channel], currentTickCount, tickDuration, rowDuration, when);
              }
            }
            scheduleS3mVolumeSlide(channel, parameter, currentTickCount, tickDuration, when);
          }
          if (format === 'S3M' && (effect === 8 || effect === 11) && channelVoices[channel] && s3mVibratoDepth[channel] > 0) {
            const voice = channelVoices[channel]!;
            const vibratoStartsOnRow = effect === 8 && s3mVibratoParameterDepth > 0;
            voice.pitch.cancelScheduledValues(when);
            for (let tick = 0; tick < currentTickCount; tick += 1) {
              const hasTickVibrato = tick > 0 || vibratoStartsOnRow;
              const phase = s3mVibratoPhaseAtRow + (tick + 1) * s3mVibratoSpeed[channel];
              const offset = hasTickVibrato
                ? s3mVibratoSemitoneOffset(voice.pitchValue, voice.sampleRate ?? 8363, phase, s3mVibratoDepth[channel])
                : 0;
              const semitones = voice.pitchValue - voice.rootNote + offset;
              const value = voice.oscillator
                ? 440 * Math.pow(2, (voice.pitchValue - 48 + offset) / 12)
                : Math.pow(2, semitones / 12);
              voice.pitch.setValueAtTime(value, when + tick * tickDuration);
            }
          }
          if (format === 'IT' && effect === 11 && channelVoices[channel] && itVibratoSpeedMemory[channel] > 0 && itVibratoDepthMemory[channel] > 0) {
            const voice = channelVoices[channel]!;
            voice.pitch.cancelScheduledValues(when);
            for (let tick = 0; tick < currentTickCount; tick += 1) {
              const phase = itVibratoPhaseAtRow + (tick + 1) * itVibratoSpeedMemory[channel] * (2 * Math.PI / 64);
              const offset = Math.sin(phase) * (itVibratoDepthMemory[channel] / 16);
              const semitones = voice.pitchValue - voice.rootNote + offset;
              const value = voice.oscillator
                ? 440 * Math.pow(2, (voice.pitchValue - 49 + offset) / 12)
                : Math.pow(2, semitones / 12);
              voice.pitch.setValueAtTime(value, when + tick * tickDuration);
            }
          }
          if (format === 'S3M' && (effect === 5 || effect === 6) && channelVoices[channel]) {
            scheduleS3mPitchSlide(channelVoices[channel]!, effect, s3mPitchSlideParameter, currentTickCount, tickDuration, when);
          }
          if (format === 'IT' && (effect === 5 || effect === 6) && channelVoices[channel]) {
            scheduleItPitchSlide(channelVoices[channel]!, effect, itPitchSlideParameter, currentTickCount, tickDuration, when);
          }
          if ((format === 'S3M' || format === 'IT') && effect === 17 && !keyOff && channelVoices[channel]) {
            const voice = channelVoices[channel]!;
            const interval = parameter & 0x0f;
            const retriggers = trackerMaxmodRowRetriggerCount(interval, currentTickCount);
            const originalVolume = format === 'IT' ? itNoteVolumes[channel] : s3mActiveNoteVolumes[channel];
            let retriggerVolume = originalVolume;
            let previousSource = voice.source;
            const previousBuffer = previousSource instanceof AudioBufferSourceNode ? previousSource.buffer : null;
            for (let retriggerIndex = 0; retriggerIndex < retriggers; retriggerIndex += 1) {
              retriggerVolume = applyTrackerItRetriggerVolume(retriggerVolume, parameter >> 4);
              const retriggerWhen = when + (retriggerIndex + 1) * interval * tickDuration;
              const remainingDuration = Math.max(0.005, noteCut - (retriggerWhen - when));
              const source: AudioScheduledSourceNode = previousBuffer
                ? this.context!.createBufferSource()
                : this.context!.createOscillator();
              if (source instanceof AudioBufferSourceNode && previousBuffer) {
                source.buffer = previousBuffer;
                source.playbackRate.value = voice.pitch.value;
                if (previousSource instanceof AudioBufferSourceNode) {
                  source.loop = previousSource.loop;
                  source.loopStart = previousSource.loopStart;
                  source.loopEnd = previousSource.loopEnd;
                }
              } else if (source instanceof OscillatorNode) {
                source.type = 'square';
                source.frequency.value = voice.pitch.value;
              }
              if ((parameter >> 4) !== 0 && originalVolume > 0) {
                const voiceGain = this.context!.createGain();
                voiceGain.gain.value = retriggerVolume / originalVolume;
                source.connect(voiceGain);
                voiceGain.connect(voice.gain);
              } else source.connect(voice.gain);
              if (previousSource) {
                try { previousSource.stop(retriggerWhen); } catch { /* already stopped before this scheduled tick */ }
              }
              source.start(retriggerWhen);
              source.stop(retriggerWhen + remainingDuration + 0.01);
              voice.activeSources?.add(source);
              this.trackSource(source, () => {
                voice.activeSources?.delete(source);
                if (voice.activeSources?.size === 0) {
                  voice.gain.disconnect();
                  this.gainNodes = this.gainNodes.filter(activeGain => activeGain !== voice.gain);
                }
              });
              previousSource = source;
              voice.source = source;
              voice.pitch = source instanceof AudioBufferSourceNode ? source.playbackRate : source.frequency;
            }
            if (format === 'IT') itNoteVolumes[channel] = retriggerVolume;
            s3mActiveNoteVolumes[channel] = retriggerVolume;
          }
          if (extendedCommand === 0x0c && channelGains[channel]) {
            const previous = channelGains[channel]!;
            previous.gain.cancelScheduledValues(when);
            previous.gain.setValueAtTime(Math.max(0.0001, previous.gain.value), when);
            previous.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.005, noteCut));
          } else if (keyOff && channelGains[channel]) {
            const previous = channelGains[channel]!;
            const keyOffTime = when + noteDelay;
            const explicitVolumeCut = format === 'XM' && (event.volume === 0x10 || effect === 0x0c && parameter === 0);
            const hasScheduledEnvelopeRelease = !explicitVolumeCut && (format === 'XM' || format === 'IT') && Math.abs(scheduledEnvelopeReleaseTimes[channel] - keyOffTime) < 1e-6;
            if (!hasScheduledEnvelopeRelease) {
              previous.gain.cancelScheduledValues(keyOffTime);
              previous.gain.setValueAtTime(Math.max(0.0001, previous.gain.value), keyOffTime);
              previous.gain.exponentialRampToValueAtTime(0.0001, keyOffTime + 0.01);
            }
            scheduledEnvelopeReleaseTimes[channel] = -1;
            channelVoices[channel] = undefined;
          }
          continue;
        }
        const instrumentSample = samples.get(channelInstruments[channel]);
        const noteMapLength = instrumentSample?.noteMap?.length ?? 96;
        if (musicalNote <= 0) continue;
        const mappedNote = Math.max(0, Math.min(noteMapLength - 1, musicalNote - 1));
        const mappedSampleIndex = instrumentSample?.noteMap?.[mappedNote] ?? 0;
        const noteTranspose = instrumentSample?.noteTranspose?.[mappedNote] ?? 0;
        const sample = instrumentSample?.variants?.[mappedSampleIndex] ?? instrumentSample;
        const arpeggioEffect = format === 'XM' || format === 'MOD' ? effect === 0 : effect === 10; // J in S3M/IT
        const arpeggioOffset = arpeggioEffect && parameter ? ((parameter >> 4) || 0) : 0;
        const vibratoEffect = format === 'XM' ? effect === 4 || effect === 6 : format === 'MOD' ? effect === 4 || effect === 6 : effect === 8 || effect === 11 || effect === 21; // H/K/U in S3M/IT
        const fineVibratoEffect = (format === 'S3M' || format === 'IT') && effect === 21;
        const vibratoOffset = vibratoEffect ? ((parameter & 0x0f) / (fineVibratoEffect ? 128 : 64)) : 0;
        // XM 1xx/2xx and S3M/IT E/F are directional pitch slides.
        const portamentoEffect = format === 'XM' || format === 'MOD' ? effect === 1 || effect === 2 : false;
        const portamentoOffset = portamentoEffect
          ? (format === 'XM'
            ? (effect === 1 ? (parameter & 0xff) : -(parameter & 0xff)) / 8
            : (effect === 1 ? (parameter & 0xff) : -(parameter & 0xff)) / 8)
          : 0;
        // XM E1x/E2x are fine portamento slides applied on the first tick.
        const finePortamentoOffset = format === 'XM' && effect === 0x0e && (extendedCommand === 0x01 || extendedCommand === 0x02)
          ? (extendedCommand === 0x01 ? extendedValue : -extendedValue) / 16
          : 0;
        const fineTuneOffset = format === 'XM' && effect === 0x0e && extendedCommand === 0x05
          ? ((extendedValue >= 8 ? extendedValue - 16 : extendedValue) / 8)
          : 0;
        const sampleFineTuneOffset = format === 'XM' && extendedCommand !== 0x05
          ? (sample?.fineTune ?? 0) / 128
          : 0;
        const portamentoProgress = (offset: number): number => portamentoEffect
          ? Math.max(0, Math.min(1, offset / Math.max(tickDuration, rowDuration)))
          : 0;
        const arpeggioHigh = arpeggioEffect ? ((parameter >> 4) & 0x0f) : 0;
        const arpeggioLow = arpeggioEffect ? (parameter & 0x0f) : 0;
        const vibratoParameter = format === 'XM'
          ? xmVibratoParameter
          : format === 'MOD'
            ? (modVibratoSpeed << 4) | modVibratoDepth
            : parameter;
        const s3mVibratoEffect = format === 'S3M' && (effect === 8 || effect === 11);
        const vibratoSpeed = s3mVibratoEffect ? s3mVibratoSpeed[channel] : format === 'IT' && vibratoEffect ? itVibratoSpeedMemory[channel] : vibratoEffect ? ((vibratoParameter >> 4) & 0x0f) : 0;
        // IT Hxy/Kxy/Uxy use Maxmod's integer Amiga-period slide path. Model
        // its FineSineData value and period delta instead of scaling semitones.
        const vibratoDepth = s3mVibratoEffect ? s3mVibratoDepth[channel] : format === 'IT' && vibratoEffect ? itVibratoDepthMemory[channel] : vibratoEffect ? (vibratoParameter & 0x0f) : 0;
        const volumeColumn = event.volume & 0xff;
        // Maxmod applies XM Axy to the channel volume, then an explicit XM
        // volume column or Cxx replaces that same channel volume on tick 0.
        // Keep the preview's Axy gain in sync when a later note resets it.
        if (format === 'XM' && (effect === 0x0c || volumeColumn >= 0x10 && volumeColumn <= 0x50 || event.note > 0 && event.instrument > 0)) {
          xmChannelSlideVolumes[channel] = 64;
          channelFaders[channel]?.gain.setValueAtTime(1, when);
        }
        const volumeVibrato = format === 'XM' && volumeColumn >= 0xb0 && volumeColumn <= 0xbf;
        const volumeVibratoSpeed = volumeVibrato ? (volumeColumn >> 4) & 0x0f : 0;
        const volumeVibratoDepth = volumeVibrato ? volumeColumn & 0x0f : 0;
        const hasPitchModulation = portamentoOffset !== 0
          || arpeggioHigh !== 0
          || arpeggioLow !== 0
          || (vibratoDepth > 0 && vibratoSpeed > 0)
          || (volumeVibratoSpeed > 0 && volumeVibratoDepth > 0);
        const pitchAt = (offset: number): number => {
          // XM pattern notes are stored as 1..96, while sample root notes and
          // the tracker frequency table are indexed from C-0 = 0. Convert the
          // note before applying the sample-relative tone or tuning offsets.
          // mmutil maps each signed MOD finetune nibble step to 1/192 octave
          // (1/16 semitone) when it sets the sample C5 speed.
          const formatFineTune = format === 'MOD' ? (sample?.fineTune ?? 0) / 16 : 0;
          const modPitch = format === 'MOD' && modPeriod > 0 ? modPeriodToPitch(modPeriod) : 0;
          let semitones = (format === 'MOD' ? modPitch : musicalNote - (format === 'XM' ? 1 : 0)) + noteTranspose + formatFineTune + fineTuneOffset + sampleFineTuneOffset + finePortamentoOffset + portamentoOffset * portamentoProgress(offset);
          if (arpeggioEffect) {
            const phase = Math.floor(Math.max(0, offset) / Math.max(0.0001, tickDuration)) % 3;
            semitones = format === 'XM'
              ? trackerXmArpeggioPitchAtTick(semitones, parameter, phase)
              : semitones + (phase === 1 ? arpeggioHigh : phase === 2 ? arpeggioLow : 0);
          }
          if (vibratoEffect && vibratoDepth > 0 && vibratoSpeed > 0) {
            if (s3mVibratoEffect) {
              const tick = Math.max(0, Math.floor(Math.max(0, offset) / Math.max(0.0001, tickDuration)));
              if (tick > 0 || s3mVibratoParameterDepth > 0) {
                const phase = s3mVibratoPhaseAtRow + (tick + 1) * s3mVibratoSpeed[channel];
                semitones += s3mVibratoSemitoneOffset(musicalNote + noteTranspose, sample?.sampleRate ?? 8363, phase, s3mVibratoDepth[channel]);
              }
            } else {
              const phase = format === 'MOD' ? modVibratoPhaseAtRow : format === 'XM' ? xmVibratoPhaseAtRow : format === 'IT' ? itVibratoPhaseAtRow : 0;
              const phaseStep = 2 * Math.PI / 64;
              const tickPosition = Math.max(0, offset) / Math.max(0.0001, tickDuration);
              const advancesOnFirstTick = fineVibratoEffect || format === 'IT' && (effect === 11 || effect === 8 && (parameter & 0x0f) > 0);
              const vibratoPhase = phase + (tickPosition + (advancesOnFirstTick ? 1 : 0)) * vibratoSpeed * phaseStep;
              const vibratoWave = format === 'XM'
                ? xmWaveform(xmVibratoWaveforms[channel], vibratoPhase, true)
                : Math.sin(vibratoPhase);
              semitones = format === 'IT' && (effect === 8 || effect === 11 || effect === 21)
                ? trackerItMaxmodFineVibratoPitch(sample?.sampleRate ?? 8_363, semitones, sample?.rootNote ?? 61, vibratoPhase, vibratoDepth)
                : semitones + vibratoWave * (vibratoDepth / 16);
            }
          }
          if (volumeVibrato) {
            if (volumeVibratoSpeed > 0 && volumeVibratoDepth > 0) {
              semitones += Math.sin((Math.max(0, offset) / Math.max(0.0001, tickDuration)) * volumeVibratoSpeed * Math.PI / 2) * (volumeVibratoDepth / 16);
            }
          }
          return semitones;
        };
        if (format === 'IT' && vibratoEffect && vibratoSpeed > 0 && vibratoDepth > 0) {
          const tickZeroAdvance = effect === 8 && (parameter & 0x0f) === 0 ? 0 : 1;
          const vibratoTicks = Math.max(0, currentTickCount - 1 + tickZeroAdvance);
          itVibratoPhases[channel] = (itVibratoPhaseAtRow + vibratoTicks * vibratoSpeed * (2 * Math.PI / 64)) % (2 * Math.PI);
        }
        const initialPitch = pitchAt(0);
        const voiceBasePitch = s3mVibratoEffect && s3mVibratoParameterDepth > 0
          ? initialPitch - s3mVibratoSemitoneOffset(musicalNote + noteTranspose, sample?.sampleRate ?? 8363, s3mVibratoPhaseAtRow + s3mVibratoSpeed[channel], s3mVibratoDepth[channel])
          : initialPitch;
        if (format === 'MOD' && (effect === 3 || effect === 5) && musicalNote > 0 && channelVoices[channel]) {
          const voice = channelVoices[channel]!;
          const speed = effect === 5 ? modPortamentoSpeeds[channel] : parameter || modPortamentoSpeeds[channel];
          const targetPitch = modPeriodToPitch(modPeriod) + (sample?.fineTune ?? 0) / 16;
          const targetPeriod = modPitchToPeriod(targetPitch);
          modPortamentoTargets[channel] = targetPeriod;
          scheduleModPortamento(voice, targetPeriod, speed, currentSpeed, tickDuration, rowDuration, when + noteDelay);
          if (effect === 5 && channelGains[channel]) {
            for (const step of modVolumeSteps) {
              channelGains[channel]!.gain.setValueAtTime(modVoiceGainAtVolume(step.value, voice.channelVolume, laneMixScale), when + step.time);
            }
          }
          continue;
        }
        if (format === 'XM' && (effect === 3 || effect === 5) && musicalNote > 0 && channelVoices[channel]) {
          const voice = channelVoices[channel]!;
          const speed = effect === 5 ? xmTonePortamentoSpeeds[channel] : parameter || xmTonePortamentoSpeeds[channel];
          if (speed > 0) {
            const targetPitch = musicalNote - 1 + noteTranspose + sampleFineTuneOffset;
            const targetPeriod = voice.xmLinearPeriods
              ? trackerXmMaxmodLinearPeriod(targetPitch + voice.rootNote - 48)
              : 1712 * Math.pow(2, (49 - targetPitch) / 12);
            xmTonePortamentoTargets[channel] = targetPeriod;
            schedulePeriodPortamento(voice, targetPeriod, speed, currentSpeed, tickDuration, rowDuration, when + noteDelay, xmGlissandoEnabled[channel]);
          }
          continue;
        }
        if (format === 'S3M' && effect === 7 && musicalNote > 0 && channelVoices[channel]) {
          const voice = channelVoices[channel]!;
          const speed = parameter || s3mTonePortamentoSpeeds[channel];
          if (speed > 0) {
            const targetPitch = musicalNote + noteTranspose;
            const targetPeriod = trackerS3mMaxmodAmigaPeriod(voice.sampleRate ?? 8363, targetPitch);
            s3mTonePortamentoTargets[channel] = targetPeriod;
            schedulePeriodPortamento(voice, targetPeriod, speed, currentSpeed, tickDuration, rowDuration, when + noteDelay);
          }
          continue;
        }
        if (format === 'S3M' && effect === 12 && musicalNote > 0 && channelVoices[channel]) {
          const voice = channelVoices[channel]!;
          const targetPitch = musicalNote + noteTranspose;
          const targetPeriod = trackerS3mMaxmodAmigaPeriod(voice.sampleRate ?? 8363, targetPitch);
          s3mTonePortamentoTargets[channel] = targetPeriod;
          schedulePeriodPortamento(voice, targetPeriod, s3mTonePortamentoSpeeds[channel], currentSpeed, tickDuration, rowDuration, when + noteDelay);
          scheduleS3mVolumeSlide(channel, parameter, currentSpeed, tickDuration, when + noteDelay);
          continue;
        }
        if (format === 'IT' && (effect === 7 || effect === 12) && musicalNote > 0 && channelVoices[channel]) {
          const voice = channelVoices[channel]!;
          const targetPitch = musicalNote + noteTranspose;
          const targetPeriod = 1712 * Math.pow(2, (49 - targetPitch) / 12);
          s3mTonePortamentoTargets[channel] = targetPeriod;
          if (s3mTonePortamentoSpeeds[channel] > 0) scheduleItTonePortamento(voice, targetPitch, s3mTonePortamentoSpeeds[channel], currentSpeed, tickDuration, when + noteDelay);
          if (effect === 12) scheduleS3mVolumeSlide(channel, parameter, currentSpeed, tickDuration, when + noteDelay);
          continue;
        }
        const schedulePitch = (pitchParam: AudioParam, baseFrequency: number, when: number, length: number, absoluteFrequency = false, s3mBaseScale = 1) => {
          const valueAt = (offset: number) => {
            const samplePitch = sample?.rootNote ?? 48;
            const semitones = format === 'XM'
              ? pitchAt(offset) - 48 + samplePitch - 48
              : pitchAt(offset) - samplePitch;
            const s3mMaxmodScale = format === 'S3M' && sample
              ? trackerS3mMaxmodPlaybackRateScale(sample.sampleRate, pitchAt(0), sample.rootNote ?? 49)
              : 1;
            const itMaxmodScale = format === 'IT' && sample
              ? trackerItMaxmodPlaybackRateScale(sample.sampleRate, pitchAt(offset), sample.rootNote ?? 61)
              : 1;
            const modFineTune = format === 'MOD' ? sample?.fineTune ?? 0 : 0;
            const modMaxmodScale = format === 'MOD' && sample
              ? trackerModMaxmodPlaybackRateScale(sample.sampleRate, pitchAt(offset) - modFineTune / 16, sample.rootNote ?? 49, modFineTune)
              : 1;
            const xmMaxmodScale = format === 'XM' && sample
              ? trackerXmMaxmodPlaybackRateScale(sample.sampleRate, pitchAt(offset) + (sample.rootNote ?? 48) - 48, 48)
              : 1;
            const ratio = format === 'XM'
              ? xmMaxmodScale
              : format === 'MOD' && sample
                ? modMaxmodScale
                : Math.pow(2, semitones / 12) * (format === 'IT' ? itMaxmodScale : s3mMaxmodScale) / s3mBaseScale;
            return absoluteFrequency ? baseFrequency * ratio : ratio;
          };
          pitchParam.setValueAtTime(valueAt(0), when);
          if (!hasPitchModulation) return;
          if (format === 'XM' && arpeggioEffect) {
            for (let tick = 1; tick < currentTickCount; tick += 1) {
              pitchParam.setValueAtTime(valueAt(tick * tickDuration), when + tick * tickDuration);
            }
            return;
          }
          const modulationLength = format === 'XM' || format === 'MOD' ? Math.min(length, rowDuration) : length;
          const steps = Math.max(1, Math.min(64, Math.ceil(modulationLength / Math.max(0.005, tickDuration / 2))));
          for (let step = 1; step <= steps; step += 1) {
            const offset = (modulationLength * step) / steps;
            pitchParam.linearRampToValueAtTime(valueAt(offset), when + offset);
          }
        };
        const volumeSlideEffect = format === 'MOD' || format === 'XM' || format === 'S3M' ? false : effect === 4 || effect === 11 || effect === 12; // IT D/K/L stays on the note gain; S3M uses its channel faders.
        const slideUp = (parameter >> 4) & 0x0f;
        const slideDown = parameter & 0x0f;
        const volumeSlide = volumeSlideEffect ? (slideUp > 0 ? slideUp : -slideDown) : 0;
        // XM EAx/EBx are fine volume slides applied once on the row's first tick.
        const fineVolumeSlide = format === 'XM' && effect === 0x0e && (extendedCommand === 0x0a || extendedCommand === 0x0b)
          ? (extendedCommand === 0x0a ? -extendedValue : extendedValue)
          : 0;
        const itTremoloEffect = format === 'IT' && effect === 18;
        const tremoloEffect = format === 'XM' || format === 'MOD' ? effect === 0x07 : itTremoloEffect;
        const tremoloDepth = tremoloEffect
          ? format === 'XM' ? ((parameter & 0x0f) * 4) / 64 : Math.min(1, (parameter & 0x0f) / 15) * 0.5
          : 0;
        const tremoloSpeed = tremoloEffect ? ((parameter >> 4) & 0x0f) : 0;
        let volumeColumnSlide = 0;
        let volumeColumnFineSlide = 0;
        if (format === 'XM' && volumeColumn >= 0x60 && volumeColumn < 0x80) {
          const nibble = volumeColumn & 0x0f;
          if (volumeColumn < 0x70) {
            if (nibble) xmVolumeColumnSlideMemory[channel] = nibble;
            volumeColumnSlide = -(nibble || xmVolumeColumnSlideMemory[channel]);
          } else {
            if (nibble) xmVolumeColumnSlideMemory[channel] = nibble << 4;
            volumeColumnSlide = (nibble || (xmVolumeColumnSlideMemory[channel] >> 4));
          }
        } else if (format === 'XM' && volumeColumn >= 0x80 && volumeColumn < 0xa0) {
          const nibble = volumeColumn & 0x0f;
          if (volumeColumn < 0x90) {
            if (nibble) xmFineVolumeColumnSlideMemory[channel] = nibble;
            volumeColumnFineSlide = -(nibble || xmFineVolumeColumnSlideMemory[channel]);
          } else {
            if (nibble) xmFineVolumeColumnSlideMemory[channel] = nibble << 4;
            volumeColumnFineSlide = (nibble || (xmFineVolumeColumnSlideMemory[channel] >> 4));
          }
        }
        const xmPanParameter = parameter || xmPanSlideMemory[channel];
        const xmEffectPanSlide = format === 'XM' && effect === 0x19
          ? (((xmPanParameter >> 4) & 0x0f) > 0 ? ((xmPanParameter >> 4) & 0x0f) : -(xmPanParameter & 0x0f)) * (2 / 255)
          : 0;
        const panSlide = format === 'XM' && volumeColumn >= 0xd0 && volumeColumn <= 0xef
          ? (volumeColumn >= 0xe0 ? (volumeColumn & 0x0f) / 15 : -(volumeColumn & 0x0f) / 15)
          : xmEffectPanSlide !== 0
            ? xmEffectPanSlide
            // Maxmod's S3M/IT Pxy handler is an explicit no-op in the default
            // build core; keep those formats aligned with the ROM behavior.
            : 0;
        if (format === 'IT' && hasMusicalNote && event.instrument > 0 && !hasItVolumeColumnLevel) {
          itNoteVolumes[channel] = Math.max(0, Math.min(64, sample?.volume ?? 64));
        }
        if (format === 'XM') {
          const hasVolumeColumnLevel = volumeColumn >= 0x10 && volumeColumn <= 0x50;
          if (effect === 0x0c) xmActiveNoteVolumes[channel] = Math.min(64, parameter);
          else if (hasVolumeColumnLevel) xmActiveNoteVolumes[channel] = volumeColumn - 0x10;
          else if (event.note > 0 && event.instrument > 0) xmActiveNoteVolumes[channel] = sample?.volume ?? 64;
          else if (event.note > 0 && xmActiveNoteVolumes[channel] === 64 && instrumentSample?.volume !== undefined) xmActiveNoteVolumes[channel] = instrumentSample.volume;
          if (volumeColumnFineSlide !== 0) {
            xmActiveNoteVolumes[channel] = Math.max(0, Math.min(64, xmActiveNoteVolumes[channel] + volumeColumnFineSlide));
            const voice = channelVoices[channel];
            const base = voice?.baseVolume ?? xmActiveNoteVolumes[channel];
            if (voice) channelFaders[channel]?.gain.setValueAtTime(base > 0 ? xmActiveNoteVolumes[channel] / base : 0, when);
          }
          if (volumeColumnSlide !== 0 && currentTickCount > 1 && event.note <= 0) {
            const voice = channelVoices[channel];
            for (let tick = 1; tick < currentTickCount; tick += 1) {
              xmActiveNoteVolumes[channel] = Math.max(0, Math.min(64, xmActiveNoteVolumes[channel] + volumeColumnSlide));
              if (voice) {
                const base = voice.baseVolume ?? 64;
                channelFaders[channel]?.gain.setValueAtTime(base > 0 ? xmActiveNoteVolumes[channel] / base : 0, when + tick * tickDuration);
              }
            }
          }
        }
        const eventVolume = format === 'S3M'
          ? trackerS3mVolumeForEvent(
            event.volumePresent ? event.volume : undefined,
            event.note,
            event.instrument,
            sample?.volume,
            s3mActiveNoteVolumes[channel],
          )
          : format === 'XM'
          ? (effect === 0x0c || volumeColumn >= 0x10 && volumeColumn <= 0x50
            ? xmActiveNoteVolumes[channel]
            : Math.min(0x40, Math.max(0, xmActiveNoteVolumes[channel] + volumeSlide + fineVolumeSlide)))
          : format === 'MOD'
            ? modVolumeAtRowStart
            : format === 'IT'
              ? itFineVolumeEffect
                ? applyTrackerItFineVolume(hasItVolumeColumnLevel ? event.volume : itNoteVolumes[channel], parameter)
                : hasItVolumeColumnLevel ? event.volume : itNoteVolumes[channel]
              : event.volume > 0 ? Math.min(64, Math.max(0, event.volume + volumeSlide)) : 64;
        const channelVolume = channelVolumes[channel] === undefined
          ? 1
          : Math.max(0, Math.min(1, Number(channelVolumes[channel]) || 0));
        const perVoiceGlobalVolume = format === 'S3M' || format === 'IT' ? 1 : globalVolume / 64;
        // XM sample-header volume initializes the channel when a new instrument
        // note starts; volume-column and Cxx values then replace that level.
        // MOD's sample-header volume initializes the channel volume above;
        // the sample itself has unity global volume in the Maxmod soundbank.
        const sampleVolume = format === 'XM' || format === 'S3M' || format === 'MOD' ? 64 : sample?.volume ?? 64;
        const gainVolume = format === 'S3M' ? 64 : eventVolume;
        const volume = Math.max(0, Math.min(1, (gainVolume / 64) * perVoiceGlobalVolume * (sampleVolume / 64) * (format === 'XM' || format === 'IT' ? 1 : 1 - tremoloDepth) * channelVolume));
        const gain = this.context!.createGain();
        const activeVoiceSources = new Set<AudioScheduledSourceNode>();
        const trackVoice = (source: AudioScheduledSourceNode) => {
          activeVoiceSources.add(source);
          this.trackSource(source, () => {
            activeVoiceSources.delete(source);
            if (activeVoiceSources.size === 0) {
              gain.disconnect();
              this.gainNodes = this.gainNodes.filter(activeGain => activeGain !== gain);
            }
          });
        };
        const noteWhen = when + noteDelay;
        const previousVoice = channelVoices[channel];
        const noteHeldEnd = noteWhen + noteCut;
        let noteEnd = noteHeldEnd;
        let releaseTail = 0;
        let releasedAtFrame = Number.POSITIVE_INFINITY;
        let fadeoutStartedAtFrame = Number.POSITIVE_INFINITY;
        const envelope = instrumentSample?.volumeEnvelope;
        const envelopeEnabledAtRowStart = itVolumeEnvelopeEnabled[channel];
        const itNewNoteAction = format === 'IT' ? itNnaModeAtRow(channel, rowIndex) : 0;
        if (format === 'IT' && itNewNoteAction === 3 && previousVoice?.source && (previousVoice.fadeout ?? 0) > 0) {
          const fadeoutTicks = Math.ceil((previousVoice.fadeoutMaximum ?? 65536) / (previousVoice.fadeout ?? 1));
          previousVoice.source.stop(noteWhen + (fadeoutTicks * tickDuration) + 0.01);
        }
        const itEnvelopeControlChanges: Array<{ time: number; enabled: boolean }> = [];
        if (format === 'IT') {
          const controlEndRow = nextEventRow >= 0 ? nextEventRow : rows.length;
          for (let controlRow = rowIndex + 1; controlRow < controlEndRow; controlRow += 1) {
            const controlEvent = rows[controlRow]?.[channel];
            if ((controlEvent?.effect & 0xff) !== 19 || ((controlEvent?.parameter ?? 0) >> 4) !== 0x07) continue;
            const controlValue = (controlEvent?.parameter ?? 0) & 0x0f;
            if (controlValue === 0x07 || controlValue === 0x08) {
              itEnvelopeControlChanges.push({ time: start + rowTimes[controlRow], enabled: controlValue === 0x08 });
            }
          }
        }
        const envelopeEnabledAt = (time: number) => {
          let enabled = envelopeEnabledAtRowStart;
          for (const change of itEnvelopeControlChanges) {
            if (time + 1e-7 < change.time) break;
            enabled = change.enabled;
          }
          return enabled;
        };
        let envelopeFrames: ReturnType<typeof trackerEnvelopeFrameTimes> = [];
        const hasVolumeEnvelope = Boolean(envelope?.points.length && (envelope.enabled || itEnvelopeControlChanges.some(change => change.enabled)));
        const hasItFadeout = format === 'IT' && (instrumentSample?.fadeout ?? 0) > 0;
        if ((format === 'XM' || format === 'IT') && (nextEventIsKeyOff || nextEventFadesItVoice) && (hasVolumeEnvelope || hasItFadeout || nextEventFadesItVoice)) {
          const keyOffTime = start + nextNoteTime;
          const followingEventRow = low + 1 < channelNoteRows.length ? channelNoteRows[low + 1] : -1;
          const releaseBoundary = nextEventNnaOff || nextEventNnaFade
            ? songDuration
            : start + (followingEventRow >= 0 ? rowTimes[followingEventRow] : songDuration);
          const releaseCandidates = trackerEnvelopeFrameTimes(rowTimes, rowTickDurations, rowTickCounts, start, rowIndex, noteWhen, releaseBoundary);
          const keyOffFrame = releaseCandidates.find(frame => frame.time >= keyOffTime - 1e-7);
          if (keyOffFrame) {
            const fadeoutRate = Math.max(0, instrumentSample.fadeout ?? 0);
            const fadeoutMaximum = Math.max(1, instrumentSample.fadeoutMaximum ?? 65536);
            if (nextEventNnaFade) {
              fadeoutStartedAtFrame = keyOffFrame.frame;
              const fadeoutTicks = fadeoutRate > 0 ? Math.ceil(fadeoutMaximum / fadeoutRate) : 0;
              const targetFrame = fadeoutTicks > 0
                ? releaseCandidates.find(frame => frame.frame >= keyOffFrame.frame + fadeoutTicks)
                : undefined;
              noteEnd = targetFrame ? Math.min(releaseBoundary, targetFrame.time + 0.005) : releaseBoundary;
              releaseTail = Math.max(0, noteEnd - noteHeldEnd);
              envelopeFrames = releaseCandidates.filter(frame => frame.time < noteEnd);
            } else {
            releasedAtFrame = keyOffFrame.frame;
            const fadeoutApplies = format === 'XM' || nextEventIsNoteFade || !hasVolumeEnvelope || Boolean(envelope?.loopEnabled);
            if (fadeoutApplies) fadeoutStartedAtFrame = keyOffFrame.frame;
            const fadeoutTicks = fadeoutApplies && fadeoutRate > 0 ? Math.ceil(fadeoutMaximum / fadeoutRate) : 0;
            const finalEnvelopePoint = envelope?.points[envelope.points.length - 1];
            const sustainStartTick = envelope?.points[envelope.sustainStart ?? envelope.sustain]?.tick;
            const sustainEndTick = envelope?.points[envelope.sustainEnd ?? envelope.sustain]?.tick;
            const releaseEnvelopeFrame = envelope?.sustainEnabled && sustainStartTick !== undefined && sustainEndTick !== undefined && sustainEndTick > sustainStartTick && keyOffFrame.frame > sustainEndTick
              ? sustainStartTick + ((keyOffFrame.frame - sustainEndTick - 1) % (sustainEndTick - sustainStartTick + 1))
              : keyOffFrame.frame;
            const envelopeTailTicks = hasVolumeEnvelope && finalEnvelopePoint ? Math.max(0, finalEnvelopePoint.tick - releaseEnvelopeFrame) : 0;
            const holdToBoundary = fadeoutTicks === 0 && Boolean(envelope?.loopEnabled || finalEnvelopePoint && finalEnvelopePoint.value > 0);
            const targetFrame = releaseCandidates.find(frame => frame.frame >= keyOffFrame.frame + Math.max(fadeoutTicks, envelopeTailTicks));
            noteEnd = holdToBoundary || !targetFrame ? releaseBoundary : Math.min(releaseBoundary, targetFrame.time + 0.005);
            releaseTail = Math.max(0, noteEnd - noteHeldEnd);
            envelopeFrames = releaseCandidates.filter(frame => frame.time < noteEnd);
            scheduledEnvelopeReleaseTimes[channel] = keyOffTime;
            }
          }
        }
        if (envelopeFrames.length === 0 && hasVolumeEnvelope && envelope) {
          envelopeFrames = trackerEnvelopeFrameTimes(rowTimes, rowTickDurations, rowTickCounts, start, rowIndex, noteWhen, noteEnd);
        }
        const previous = channelGains[channel];
        if (previous && !(format === 'IT' && (itNewNoteAction === 1 || itNewNoteAction === 2 || itNewNoteAction === 3))) {
          previous.gain.cancelScheduledValues(noteWhen);
          previous.gain.setValueAtTime(Math.max(0.0001, previous.gain.value), noteWhen);
          if (format === 'S3M') previous.gain.setValueAtTime(0.0001, noteWhen);
          else previous.gain.exponentialRampToValueAtTime(0.0001, noteWhen + 0.005);
        }
        channelGains[channel] = gain;
        gain.gain.setValueAtTime(format === 'MOD' && volume <= 0 ? 0 : 0.0001, noteWhen);
        // Maxmod applies gain per lane, sums the PCM, then saturates its final
        // 8-bit output. Keep this lane gain independent of channel count.
        const maxmodVoiceVolume = maxmodMixerVolumeAt(gainVolume, instrumentSample ?? sample);
        const peakGain = trackerMaxmodGbaOutputGain(maxmodVoiceVolume, format) * channelVolume;
        if (format === 'S3M' || format === 'IT') {
          if (format === 'IT') itNoteVolumes[channel] = eventVolume;
          s3mActiveNoteVolumes[channel] = eventVolume;
          s3mBaseNoteVolumes[channel] = eventVolume;
          s3mVolumeSlideFaders[channel]?.gain.setValueAtTime(1, noteWhen);
        }
        if (format === 'S3M') s3mVolumeColumnFaders[channel]?.gain.setValueAtTime(eventVolume / 64, noteWhen);
        if (format === 'S3M' && (effect === 4 || effect === 11 || effect === 12)) {
          scheduleS3mVolumeSlide(channel, parameter, currentTickCount, tickDuration, noteWhen);
        }
        if (format === 'S3M' || peakGain === 0) gain.gain.setValueAtTime(peakGain, noteWhen);
        else gain.gain.exponentialRampToValueAtTime(peakGain, noteWhen + 0.005);
        if (volumeSlideEffect && volumeSlide !== 0) {
          const slideSteps = Math.max(1, Math.min(64, Math.floor(noteCut / Math.max(0.005, tickDuration))));
          for (let step = 1; step <= slideSteps; step += 1) {
            const offset = Math.min(noteCut, step * tickDuration);
            const slidVolume = Math.max(0, Math.min(64, eventVolume + volumeSlide * step));
            const slidGain = trackerMaxmodGbaOutputGain(maxmodMixerVolumeAt(slidVolume, instrumentSample ?? sample), format) * channelVolume;
            gain.gain.linearRampToValueAtTime(slidGain, noteWhen + offset);
          }
        }
        if (format === 'MOD') {
          for (const step of modVolumeSteps) {
            gain.gain.setValueAtTime(modVoiceGainAtVolume(step.value, channelVolume, laneMixScale), noteWhen + step.time);
          }
        }
        if (itTremoloEffect && tremoloSpeed > 0 && tremoloDepth > 0) {
          const baseMaxmodVolume = Math.max(0, Math.min(128, Math.trunc((gainVolume * sampleVolume * channelVolume) / 32)));
          scheduleItTremolo(channel, gain, peakGain, baseMaxmodVolume, parameter, currentTickCount, tickDuration, noteWhen);
        } else if (tremoloEffect && tremoloSpeed > 0 && tremoloDepth > 0) {
          const tremoloLength = format === 'XM' || format === 'MOD' ? Math.min(noteCut, rowDuration) : noteCut;
          const tremoloSteps = Math.max(8, Math.min(64, Math.ceil(tremoloLength / 0.02)));
          for (let step = 1; step <= tremoloSteps; step += 1) {
            const offset = (tremoloLength * step) / tremoloSteps;
            const phase = (format === 'XM' ? xmTremoloPhaseAtRow : 0) + (offset / Math.max(0.0001, tickDuration)) * tremoloSpeed * (2 * Math.PI / 64);
            const waveform = format === 'XM'
              ? xmWaveform(xmTremoloWaveforms[channel], phase, false)
              : 0.5 + 0.5 * Math.sin(phase);
            const modulation = format === 'XM' ? Math.max(0, 1 + tremoloDepth * waveform) : 1 - tremoloDepth * waveform;
            gain.gain.linearRampToValueAtTime(Math.max(0.0001, peakGain * modulation), noteWhen + offset);
            }
          if ((format === 'XM' || format === 'MOD') && noteCut > tremoloLength) gain.gain.setValueAtTime(peakGain, noteWhen + tremoloLength);
        }
        if (envelopeFrames.length > 0) {
          for (const frame of envelopeFrames) {
            const value = hasVolumeEnvelope && envelope && envelopeEnabledAt(frame.time) ? trackerEnvelopeValueAt(envelope, frame.frame, releasedAtFrame) : 64;
            const fadeout = trackerEnvelopeFadeoutAt(instrumentSample?.fadeout ?? 0, frame.frame, fadeoutStartedAtFrame, instrumentSample?.fadeoutMaximum ?? 65536);
            gain.gain.setValueAtTime(Math.max(0.0001, peakGain * (value / 64) * fadeout), frame.time);
          }
        }
        const releaseStart = Math.max(noteWhen + 0.005, noteEnd - 0.005);
        // A tracker voice sustains until its next note/key-off. Set a fixed
        // level through the note and release over only the final 5 ms; an
        // exponential endpoint ramp otherwise decays from the previous event
        // across the entire note duration in Web Audio.
        if (format === 'MOD' && peakGain === 0) {
          gain.gain.setValueAtTime(0, noteEnd);
        } else if (releaseStart < noteEnd) {
          const releaseFrame = [...envelopeFrames].reverse().find(frame => frame.time <= releaseStart)?.frame ?? 0;
          const releaseGain = hasVolumeEnvelope && envelope && envelopeEnabledAt(releaseStart)
            ? peakGain * (trackerEnvelopeValueAt(envelope, releaseFrame, releasedAtFrame) / 64) * trackerEnvelopeFadeoutAt(instrumentSample?.fadeout ?? 0, releaseFrame, fadeoutStartedAtFrame, instrumentSample?.fadeoutMaximum ?? 65536)
            : peakGain * trackerEnvelopeFadeoutAt(instrumentSample?.fadeout ?? 0, releaseFrame, fadeoutStartedAtFrame, instrumentSample?.fadeoutMaximum ?? 65536);
          gain.gain.setValueAtTime(Math.max(0.0001, releaseGain), releaseStart);
          gain.gain.linearRampToValueAtTime(0.0001, noteEnd);
        } else {
          gain.gain.setValueAtTime(0.0001, noteEnd);
        }
        const samplePan = (format === 'XM' || format === 'IT') && typeof sample?.panning === 'number'
          ? Math.max(-1, Math.min(1, (sample.panning - 128) / 128))
          : 0;
        let panAmount = Math.max(-1, Math.min(1, samplePan + channelPans[channel]));
        let panCommand = false;
        if (format === 'XM' && effect === 0x08) {
          panAmount = parameter <= 128 ? (parameter - 128) / 128 : (parameter - 128) / 127;
          panCommand = true;
        } else if (format === 'XM' && volumeColumn >= 0xc0 && volumeColumn <= 0xcf) {
          panAmount = (volumeColumn & 0x0f) / 7.5 - 1;
          panCommand = true;
        } else if (format === 'MOD' && effect === 0x0e && (parameter >> 4) === 0x08) {
          const panNibble = parameter & 0x0f;
          panAmount = trackerPanningNibbleToNormalized(panNibble);
          panCommand = true;
        } else if (format !== 'XM' && effect === 0x18) {
          panAmount = parameter <= 128 ? (parameter - 128) / 128 : (parameter - 128) / 127;
          panCommand = true;
        }
        const panner = typeof this.context.createStereoPanner === 'function' ? this.context.createStereoPanner() : null;
        if (panner) {
          const panGain = this.context.createGain();
          panner.pan.value = trackerPreviewPanPosition(panAmount);
          panGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(panAmount), noteWhen);
          if (format === 'XM' || format === 'S3M' || format === 'IT') {
            xmActivePanAmounts[channel] = panAmount;
            xmActiveSamplePans[channel] = samplePan;
            xmActivePanners[channel] = panner;
            xmActivePanGains[channel] = panGain;
          }
          if (panSlide !== 0) {
            const panSteps = Math.max(1, Math.min(64, Math.floor(noteCut / Math.max(0.005, tickDuration))));
            for (let step = 1; step <= panSteps; step += 1) {
              const offset = Math.min(noteCut, step * tickDuration);
              const nextPan = Math.max(-1, Math.min(1, panAmount + panSlide * step));
              panner.pan.linearRampToValueAtTime(trackerPreviewPanPosition(nextPan), noteWhen + offset);
              panGain.gain.linearRampToValueAtTime(trackerPreviewPanCompensationGain(nextPan), noteWhen + offset);
            }
            channelPans[channel] = Math.max(-1, Math.min(1, panAmount - samplePan + panSlide * panSteps));
            if (format === 'XM') xmActivePanAmounts[channel] = Math.max(-1, Math.min(1, panAmount + panSlide * panSteps));
          } else if (panCommand) {
            channelPans[channel] = Math.max(-1, Math.min(1, panAmount - samplePan));
            if (format === 'XM') xmActivePanAmounts[channel] = panAmount;
          }
          const panningEnvelope = instrumentSample?.panningEnvelope;
          if (panningEnvelope?.enabled && panningEnvelope.points.length > 0) {
            panner.pan.setValueAtTime(trackerPreviewPanPosition(panAmount), noteWhen);
            const frames = trackerEnvelopeFrameTimes(rowTimes, rowTickDurations, rowTickCounts, start, rowIndex, noteWhen, noteEnd);
            for (const frame of frames) {
              const envelopeValue = trackerEnvelopeValueAt(panningEnvelope, frame.frame, releasedAtFrame);
              const nextPan = trackerEnvelopePanningAt(panAmount, envelopeValue);
              panner.pan.setValueAtTime(trackerPreviewPanPosition(nextPan), frame.time);
              panGain.gain.setValueAtTime(trackerPreviewPanCompensationGain(nextPan), frame.time);
            }
          }
          gain.connect(panner).connect(panGain).connect(channelFaders[channel] ?? channelOutputs[channel]);
        } else {
          gain.connect(channelFaders[channel] ?? channelOutputs[channel]);
        }
        if (sample?.samples.length) {
          const sampleRate = Math.max(1, sample.sampleRate || 8363);
          const maxmodBasePitch = format === 'S3M'
            ? Math.trunc(pitchAt(0))
            : sample.rootNote ?? 49;
          let sampleBuffers = audioBufferCache.get(sample);
          if (!sampleBuffers) {
            sampleBuffers = new Map();
            audioBufferCache.set(sample, sampleBuffers);
          }
          const bufferKey = format === 'S3M' ? maxmodBasePitch : -1;
          let cachedBuffer = sampleBuffers.get(bufferKey);
          if (!cachedBuffer) {
            const basePlaybackScale = format === 'S3M'
              ? trackerS3mMaxmodPlaybackRateScale(sampleRate, maxmodBasePitch, maxmodBasePitch)
              : format === 'IT' ? trackerItMaxmodPlaybackRateScale(sampleRate, maxmodBasePitch, sample.rootNote ?? 61)
              : format === 'XM' ? trackerXmMaxmodBasePlaybackScale(sampleRate)
                : format === 'MOD' ? trackerModMaxmodBasePlaybackScale(sampleRate, maxmodBasePitch, sample.fineTune ?? 0) : 1;
            const convertedSamples = convertTrackerSampleToMaxmodGbaPcm(sample.samples, sample.sixteenBit);
            const maxmodStep = format === 'S3M' ? trackerS3mMaxmodMixerStepQ12(sampleRate, maxmodBasePitch)
              : format === 'IT' ? trackerItMaxmodMixerStepQ12(sampleRate, maxmodBasePitch)
              : format === 'XM' ? trackerXmMaxmodMixerStepQ12(sampleRate, 48)
                : format === 'MOD' ? trackerModMaxmodMixerStepQ12(sampleRate, maxmodBasePitch, sample.fineTune ?? 0) : 0;
            const maxmodSample = (format === 'S3M' || format === 'IT' || format === 'XM' || format === 'MOD') && maxmodStep > 0
              ? createTrackerMaxmodGbaSample(convertedSamples, maxmodStep)
              : null;
            const bufferRate = maxmodSample?.sampleRate ?? sampleRate;
            const bufferSamples = maxmodSample?.samples ?? convertedSamples;
            const buffer = this.context.createBuffer(1, bufferSamples.length, bufferRate);
            buffer.copyToChannel(bufferSamples, 0);
            cachedBuffer = { buffer, basePlaybackScale };
            sampleBuffers.set(bufferKey, cachedBuffer);
            audioBufferCacheOrder.push({ sample, key: bufferKey, entry: cachedBuffer });
            cachedAudioBufferFrames += buffer.length;
            while (audioBufferCacheOrder.length > maxCachedAudioBuffers || cachedAudioBufferFrames > maxCachedAudioBufferFrames) {
              const oldest = audioBufferCacheOrder.shift();
              if (!oldest) break;
              const oldestSampleBuffers = audioBufferCache.get(oldest.sample);
              if (oldestSampleBuffers?.get(oldest.key) === oldest.entry) {
                oldestSampleBuffers.delete(oldest.key);
                cachedAudioBufferFrames -= oldest.entry.buffer.length;
              }
            }
          }
          const { buffer: audioBuffer, basePlaybackScale } = cachedBuffer;
          const voiceCount = retriggerCount > 0 ? retriggerCount + 1 : 1;
          let retriggerVolume = eventVolume;
          for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex += 1) {
            const voiceWhen = noteWhen + (voiceIndex * retriggerInterval);
            if (voiceWhen >= noteWhen + noteCut) break;
            if (rowRetrigger && voiceIndex > 0) retriggerVolume = applyTrackerItRetriggerVolume(retriggerVolume, parameter >> 4);
            const source = this.context.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = 1;
            const isIntermediateTrackerRetrigger = (oldRetrigger || rowRetrigger) && voiceIndex < retriggerCount;
            if (sample.loopType !== 0 && sample.loopEnd > sample.loopStart && (oldRetrigger || rowRetrigger ? !isIntermediateTrackerRetrigger : retriggerCount === 0)) {
              source.loop = true;
              source.loopStart = sample.loopStart / (sampleRate * basePlaybackScale);
              source.loopEnd = sample.loopEnd / (sampleRate * basePlaybackScale);
            }
            if (rowRetrigger && (parameter >> 4) !== 0 && eventVolume > 0) {
              const voiceGain = this.context.createGain();
              voiceGain.gain.value = retriggerVolume / eventVolume;
              source.connect(voiceGain);
              voiceGain.connect(gain);
            } else source.connect(gain);
            const noteVoiceDuration = oldRetrigger || rowRetrigger
              ? isIntermediateTrackerRetrigger ? Math.min(retriggerInterval, noteCut - (voiceWhen - noteWhen)) : noteCut - (voiceWhen - noteWhen)
              : retriggerCount > 0 ? Math.min(retriggerInterval, noteCut - (voiceWhen - noteWhen)) : noteCut;
            const releaseThisVoice = oldRetrigger || rowRetrigger ? !isIntermediateTrackerRetrigger : retriggerCount === 0 || voiceWhen + noteVoiceDuration >= noteWhen + noteCut - 1e-7;
            const voiceDuration = noteVoiceDuration + (releaseThisVoice ? releaseTail : 0);
            const sourceOffset = Math.min(audioBuffer.duration, sampleOffsetFrames / (sampleRate * basePlaybackScale));
            schedulePitch(source.playbackRate, audioBuffer.sampleRate, voiceWhen, Math.max(0.005, voiceDuration), false, basePlaybackScale);
            channelVoices[channel] = { source, pitch: source.playbackRate, rootNote: sample?.rootNote ?? 49, pitchValue: voiceBasePitch + (format === 'XM' || format === 'MOD' ? portamentoOffset : 0), rowPitchModulated: hasPitchModulation, oscillator: false, gain, sampleVolume, defaultVolume: sample?.volume ?? 64, channelVolume, baseVolume: eventVolume, maxmodSampleGlobalVolume: sample?.maxmodSampleGlobalVolume, maxmodInstrumentGlobalVolume: instrumentSample?.maxmodInstrumentGlobalVolume ?? sample?.maxmodInstrumentGlobalVolume, sampleRate, xmLinearPeriods: format === 'XM' && sample?.linearPeriods === true, basePlaybackScale, s3mBasePitch: voiceBasePitch, s3mBasePeriod: format === 'S3M' ? trackerS3mMaxmodAmigaPeriod(sampleRate, voiceBasePitch) : undefined, fadeout: instrumentSample?.fadeout ?? sample?.fadeout, fadeoutMaximum: instrumentSample?.fadeoutMaximum ?? sample?.fadeoutMaximum, activeSources: activeVoiceSources };
            if (format === 'S3M' && (effect === 5 || effect === 6)) scheduleS3mPitchSlide(channelVoices[channel]!, effect, s3mPitchSlideParameter, currentTickCount, tickDuration, noteWhen);
            if (format === 'IT' && (effect === 5 || effect === 6)) scheduleItPitchSlide(channelVoices[channel]!, effect, itPitchSlideParameter, currentTickCount, tickDuration, noteWhen);
            source.start(voiceWhen, sourceOffset);
            source.stop(voiceWhen + Math.max(0.005, voiceDuration) + 0.01);
            trackVoice(source);
          }
          if (rowRetrigger) {
            if (format === 'IT') itNoteVolumes[channel] = retriggerVolume;
            s3mActiveNoteVolumes[channel] = retriggerVolume;
          }
        } else {
          const voiceCount = retriggerCount > 0 ? retriggerCount + 1 : 1;
          let retriggerVolume = eventVolume;
          for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex += 1) {
            const voiceWhen = noteWhen + (voiceIndex * retriggerInterval);
            if (voiceWhen >= noteWhen + noteCut) break;
            if (rowRetrigger && voiceIndex > 0) retriggerVolume = applyTrackerItRetriggerVolume(retriggerVolume, parameter >> 4);
            const oscillator = this.context!.createOscillator();
            oscillator.type = 'square';
            const baseFrequency = 440 * Math.pow(2, (49 - 49) / 12);
            oscillator.frequency.value = baseFrequency;
            if (rowRetrigger && (parameter >> 4) !== 0 && eventVolume > 0) {
              const voiceGain = this.context.createGain();
              voiceGain.gain.value = retriggerVolume / eventVolume;
              oscillator.connect(voiceGain);
              voiceGain.connect(gain);
            } else oscillator.connect(gain);
            oscillator.start(voiceWhen);
            const isIntermediateTrackerRetrigger = (oldRetrigger || rowRetrigger) && voiceIndex < retriggerCount;
            const noteVoiceDuration = oldRetrigger || rowRetrigger
              ? isIntermediateTrackerRetrigger ? Math.min(retriggerInterval, noteCut - (voiceWhen - noteWhen)) : noteCut - (voiceWhen - noteWhen)
              : retriggerCount > 0 ? Math.min(retriggerInterval, noteCut - (voiceWhen - noteWhen)) : noteCut;
            const releaseThisVoice = oldRetrigger || rowRetrigger ? !isIntermediateTrackerRetrigger : retriggerCount === 0 || voiceWhen + noteVoiceDuration >= noteWhen + noteCut - 1e-7;
            const voiceDuration = noteVoiceDuration + (releaseThisVoice ? releaseTail : 0);
            schedulePitch(oscillator.frequency, baseFrequency, voiceWhen, Math.max(0.005, voiceDuration), true);
            channelVoices[channel] = { source: oscillator, pitch: oscillator.frequency, rootNote: 48, pitchValue: voiceBasePitch + (format === 'XM' || format === 'MOD' ? portamentoOffset : 0), rowPitchModulated: hasPitchModulation, oscillator: true, gain, sampleVolume: sample?.volume ?? 64, channelVolume, baseVolume: eventVolume, sampleRate: sample?.sampleRate ?? 8363, fadeout: instrumentSample?.fadeout ?? sample?.fadeout, fadeoutMaximum: instrumentSample?.fadeoutMaximum ?? sample?.fadeoutMaximum, activeSources: activeVoiceSources };
            if (format === 'S3M' && (effect === 5 || effect === 6)) scheduleS3mPitchSlide(channelVoices[channel]!, effect, s3mPitchSlideParameter, currentTickCount, tickDuration, noteWhen);
            if (format === 'IT' && (effect === 5 || effect === 6)) scheduleItPitchSlide(channelVoices[channel]!, effect, itPitchSlideParameter, currentTickCount, tickDuration, noteWhen);
            oscillator.stop(voiceWhen + Math.max(0.005, voiceDuration) + 0.01);
            trackVoice(oscillator);
          }
          if (rowRetrigger) {
            if (format === 'IT') itNoteVolumes[channel] = retriggerVolume;
            s3mActiveNoteVolumes[channel] = retriggerVolume;
          }
        }
        if (activeVoiceSources.size > 0) this.gainNodes.push(gain);
        else gain.disconnect();
      }
      if (rowIndex + 1 < rows.length && performance.now() - schedulerChunkStartedAt >= 8) {
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        schedulerChunkStartedAt = performance.now();
        if (generation !== this.generation || !this.context) { releaseInitialSchedule(); return; }
      }
      }
      if (!playbackResumed && this.context && generation === this.generation) {
        playbackResumed = true;
        resumePlayback();
      }
      releaseInitialSchedule();
    })().catch(error => {
      initialScheduleError = error;
      releaseInitialSchedule();
    });
    await initialScheduleReady;
    void scheduleTask.catch(error => {
      initialScheduleError = error;
      if (generation === this.generation) this.stop();
    });
    if (initialScheduleError) {
      console.warn('Tracker preview could not schedule its initial audio window.', initialScheduleError);
      if (generation === this.generation) this.stop();
      return 0;
    }
    if (generation !== this.generation || !this.context) return 0;
    if (onRow && rowTimes.length > 0) {
      let nextRow = 0;
      const updateProgress = () => {
        if (!this.context) { this.progressFrame = null; return; }
        const position = this.context.currentTime - start;
        while (nextRow < rowTimes.length && position >= rowTimes[nextRow]) onRow(nextRow++);
        if (nextRow < rowTimes.length) this.progressFrame = window.requestAnimationFrame(updateProgress);
        else this.progressFrame = null;
      };
      this.progressFrame = window.requestAnimationFrame(updateProgress);
    }
    return Math.max(100, (start + songDuration - this.context.currentTime) * 1000 + 100);
  }

  stop(): void {
    this.stopAudition();
    this.generation += 1;
    if (this.progressFrame !== null) window.cancelAnimationFrame(this.progressFrame);
    this.progressFrame = null;
    [...this.sources].forEach(source => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    });
    this.gainNodes.forEach(gain => gain.disconnect());
    this.sources.clear();
    this.gainNodes = [];
    this.channelMuteGains.forEach(gain => gain.disconnect());
    this.channelMuteGains = [];
    void this.context?.close();
    this.context = null;
  }
}
