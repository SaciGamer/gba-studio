class TrackerOutputLimiter extends AudioWorkletProcessor {
  inputPeak = 0;
  outputPeak = 0;
  blocksSinceReport = 0;
  preLimiterPower = 0;
  postLimiterPower = 0;
  preLimiterFrames = 0;
  preLimiterNegativeSamples = 0;
  preLimiterPositiveSamples = 0;
  preLimiterOutOfRangeSamples = 0;
  preLimiterMin = Number.POSITIVE_INFINITY;
  preLimiterMax = Number.NEGATIVE_INFINITY;
  preLimiterStatsStartFrame = -1;

  constructor(options) {
    super();
    this.mixRate = Math.min(sampleRate, Math.max(1, Number(options.processorOptions?.mixRate) || 15_768));
    this.mixPhase = sampleRate - this.mixRate;
    this.heldMixSamples = [0, 0];
    this.captureEnabled = options.processorOptions?.musicTestCapture === true;
    this.capturePreLimiter = options.processorOptions?.musicTestCapturePreLimiter === true;
    this.capturePreLimiterStats = options.processorOptions?.musicTestCapturePreLimiterStats === true;
    this.captureFrames = 0;
    this.captureReportedFrames = 0;
    this.captureStartFrame = -1;
    if (this.captureEnabled) {
      const captureDurationSeconds = Math.max(1, options.processorOptions?.musicTestCaptureDurationSeconds ?? 30);
      this.captureCapacity = sampleRate * captureDurationSeconds;
      this.captureLeft = new Float32Array(this.captureCapacity);
      this.captureRight = new Float32Array(this.captureCapacity);
      if (this.capturePreLimiter) {
        this.captureInputLeft = new Float32Array(this.captureCapacity);
        this.captureInputRight = new Float32Array(this.captureCapacity);
      }
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) {
      for (const destination of output) destination.fill(0);
      this.heldMixSamples.fill(0);
      return true;
    }
    const frameCount = output[0]?.length ?? 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      this.mixPhase += this.mixRate;
      let mixTick = false;
      if (this.mixPhase >= sampleRate) {
        this.mixPhase -= sampleRate;
        mixTick = true;
      }
      for (let channel = 0; channel < output.length; channel += 1) {
        const source = input[channel] || input[0];
        const sample = source?.[frame] ?? 0;
        const magnitude = Math.abs(sample);
        this.inputPeak = Math.max(this.inputPeak, magnitude);
        if (mixTick) {
          // Maxmod's default Butano setup mixes at 15,768 Hz, then stores its
          // stereo mix as signed PCM8. Hold each mixed sample until the next
          // GBA-rate tick so the browser preview includes that clock boundary.
          const pcm8 = Math.max(-128, Math.min(127, Math.floor(sample * 128)));
          this.heldMixSamples[channel] = pcm8 / 128;
        }
        const outputSample = this.heldMixSamples[channel];
        output[channel][frame] = outputSample;
        this.outputPeak = Math.max(this.outputPeak, Math.abs(outputSample));
        if (this.capturePreLimiterStats) {
          this.preLimiterPower += sample * sample;
          this.postLimiterPower += outputSample * outputSample;
          this.preLimiterFrames += 1;
          if (sample < -1 || sample > 127 / 128) this.preLimiterOutOfRangeSamples += 1;
          if (sample < 0) this.preLimiterNegativeSamples += 1;
          else if (sample > 0) this.preLimiterPositiveSamples += 1;
          this.preLimiterMin = Math.min(this.preLimiterMin, sample);
          this.preLimiterMax = Math.max(this.preLimiterMax, sample);
        }
      }
    }
    if (this.captureEnabled && output[0] && this.captureFrames < this.captureCapacity) {
      if (this.captureStartFrame < 0) this.captureStartFrame = currentFrame;
      const count = Math.min(output[0].length, this.captureCapacity - this.captureFrames);
      this.captureLeft.set(output[0].subarray(0, count), this.captureFrames);
      const right = output[1] ?? output[0];
      this.captureRight.set(right.subarray(0, count), this.captureFrames);
      if (this.captureInputLeft && this.captureInputRight) {
        const inputLeft = input[0] ?? input[1];
        const inputRight = input[1] ?? inputLeft;
        if (inputLeft) this.captureInputLeft.set(inputLeft.subarray(0, count), this.captureFrames);
        if (inputRight) this.captureInputRight.set(inputRight.subarray(0, count), this.captureFrames);
      }
      this.captureFrames += count;
    }
    this.blocksSinceReport += 1;
    if (this.blocksSinceReport >= 64) {
      const report = { inputPeak: this.inputPeak, outputPeak: this.outputPeak };
      if (this.capturePreLimiterStats && this.preLimiterFrames > 0) {
        report.preLimiterStats = {
          startFrame: this.preLimiterStatsStartFrame,
          endFrame: currentFrame + (output[0]?.length ?? 0),
          frames: this.preLimiterFrames,
          inputRms: Math.sqrt(this.preLimiterPower / this.preLimiterFrames),
          outputRms: Math.sqrt(this.postLimiterPower / this.preLimiterFrames),
          negativeSamples: this.preLimiterNegativeSamples,
          positiveSamples: this.preLimiterPositiveSamples,
          outOfRangeSamples: this.preLimiterOutOfRangeSamples,
          min: this.preLimiterMin,
          max: this.preLimiterMax,
        };
        this.preLimiterPower = 0;
        this.postLimiterPower = 0;
        this.preLimiterFrames = 0;
        this.preLimiterNegativeSamples = 0;
        this.preLimiterPositiveSamples = 0;
        this.preLimiterOutOfRangeSamples = 0;
        this.preLimiterMin = Number.POSITIVE_INFINITY;
        this.preLimiterMax = Number.NEGATIVE_INFINITY;
        this.preLimiterStatsStartFrame = currentFrame + (output[0]?.length ?? 0);
      }
      if (this.captureEnabled && this.captureFrames > this.captureReportedFrames) {
        const left = this.captureLeft.slice(this.captureReportedFrames, this.captureFrames);
        const right = this.captureRight.slice(this.captureReportedFrames, this.captureFrames);
        report.musicTestCaptureBlock = true;
        report.left = left;
        report.right = right;
        report.startFrame = this.captureStartFrame + this.captureReportedFrames;
        const transfer = [left.buffer, right.buffer];
        if (this.captureInputLeft && this.captureInputRight) {
          const inputLeft = this.captureInputLeft.slice(this.captureReportedFrames, this.captureFrames);
          const inputRight = this.captureInputRight.slice(this.captureReportedFrames, this.captureFrames);
          report.inputLeft = inputLeft;
          report.inputRight = inputRight;
          transfer.push(inputLeft.buffer, inputRight.buffer);
        }
        this.port.postMessage(report, transfer);
        this.captureReportedFrames = this.captureFrames;
      } else {
        this.port.postMessage(report);
      }
      this.inputPeak = 0;
      this.outputPeak = 0;
      this.blocksSinceReport = 0;
    }
    return true;
  }
}

registerProcessor('tracker-output-limiter', TrackerOutputLimiter);
