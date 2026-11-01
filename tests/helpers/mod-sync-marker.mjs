/** Detects the repeated on/off carrier encoded in createModSyncMarker's sample. */
export const detectPulsedToneMarkers = (
  channel,
  sampleRate,
  frequency,
  {
    sourceSampleRate = 8_363,
    framesPerPulse = 128,
    activeFrames = 64,
    pulseCount = 5,
    frequencySequence,
    threshold = 0.72,
    minimumPowerRatio = 0.015,
  } = {},
  diagnostics,
) => {
  if (!channel?.length || !(sampleRate > 0) || !(frequency > 0)) return [];
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const correlation = (left, right) => {
    const leftMean = mean(left);
    const rightMean = mean(right);
    let covariance = 0;
    let leftVariance = 0;
    let rightVariance = 0;
    for (let index = 0; index < left.length; index += 1) {
      const leftDelta = left[index] - leftMean;
      const rightDelta = right[index] - rightMean;
      covariance += leftDelta * rightDelta;
      leftVariance += leftDelta * leftDelta;
      rightVariance += rightDelta * rightDelta;
    }
    return covariance / Math.sqrt(Math.max(1e-20, leftVariance * rightVariance));
  };
  const blockSize = Math.max(96, Math.round(sampleRate * 0.004));
  const hopSize = Math.max(24, Math.round(sampleRate * 0.001));
  const frequencies = Array.from({ length: pulseCount }, (_, index) => {
    const candidate = Number(frequencySequence?.[index]);
    return Number.isFinite(candidate) && candidate > 0 ? candidate : frequency;
  });
  const markerPowers = frequencies.map(candidateFrequency => {
    const coefficient = 2 * Math.cos((2 * Math.PI * candidateFrequency) / sampleRate);
    const powers = [];
    for (let offset = 0; offset + blockSize <= channel.length; offset += hopSize) {
      let previous = 0;
      let previousPrevious = 0;
      for (let index = 0; index < blockSize; index += 1) {
        const current = channel[offset + index] + coefficient * previous - previousPrevious;
        previousPrevious = previous;
        previous = current;
      }
      powers.push(Math.max(0, previous * previous + previousPrevious * previousPrevious - coefficient * previous * previousPrevious));
    }
    return powers;
  });
  let maximumPower = 0;
  for (const powers of markerPowers) for (const power of powers) maximumPower = Math.max(maximumPower, power);
  if (!(maximumPower > 1e-8)) return [];

  const pulsePeriodSeconds = framesPerPulse / sourceSampleRate;
  const activeSeconds = activeFrames / sourceSampleRate;
  const markerDurationSeconds = pulsePeriodSeconds * pulseCount;
  // Use nearby spectral power as the floor so one loud passage in a long
  // capture cannot hide quieter markers several orders later.
  const localWindowRadius = Math.max(1, Math.ceil((markerDurationSeconds * sampleRate * 0.5) / hopSize));
  const localPowerMaximums = markerPowers.map(powers => {
    const maxima = new Float64Array(powers.length);
    const deque = new Int32Array(powers.length);
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let index = 0; index < powers.length; index += 1) {
      const windowEnd = Math.min(powers.length - 1, index + localWindowRadius);
      while (next <= windowEnd) {
        while (tail > head && powers[deque[tail - 1]] <= powers[next]) tail -= 1;
        deque[tail] = next;
        tail += 1;
        next += 1;
      }
      const windowStart = Math.max(0, index - localWindowRadius);
      while (tail > head && deque[head] < windowStart) head += 1;
      maxima[index] = powers[deque[head]] ?? 0;
    }
    return maxima;
  });
  const onCenters = [];
  const offCenters = [];
  for (let pulse = 0; pulse < pulseCount; pulse += 1) {
    const pulseStart = pulse * pulsePeriodSeconds;
    onCenters.push(pulseStart + activeSeconds * 0.5);
    offCenters.push(pulseStart + activeSeconds + (pulsePeriodSeconds - activeSeconds) * 0.5);
  }

  const candidates = [];
  const diagnosticCandidates = [];
  const template = Array.from({ length: pulseCount * 2 }, (_, index) => index % 2 === 0 ? 1 : 0);
  const minimumLocalPowerRatio = Math.max(0, Math.min(1, minimumPowerRatio));
  for (let start = 0; start < markerPowers[0].length; start += 1) {
    const on = onCenters.map((time, pulse) => markerPowers[pulse][Math.round((start * hopSize / sampleRate + time) * sampleRate / hopSize)] ?? 0);
    const off = offCenters.map((time, pulse) => markerPowers[pulse][Math.round((start * hopSize / sampleRate + time) * sampleRate / hopSize)] ?? 0);
    const onPower = mean(on);
    const offPower = mean(off);
    const pulseContrasts = on.map((power, pulse) => (power - off[pulse]) / Math.max(1e-20, power + off[pulse]));
    const usablePulseContrasts = pulseContrasts.filter(value => value >= 0.25);
    const contrast = mean(usablePulseContrasts);
    const normalizedPulseEnvelope = on.flatMap((value, index) => {
      const pulsePower = value + off[index];
      return pulsePower > 1e-10 ? [value / pulsePower, off[index] / pulsePower] : [0.5, 0.5];
    });
    const patternCorrelation = correlation(normalizedPulseEnvelope, template);
    const localPulseMaximums = localPowerMaximums.map(powers => powers[start] ?? 0).sort((left, right) => left - right);
    const medianLocalPower = localPulseMaximums[Math.floor(localPulseMaximums.length / 2)] ?? 0;
    const minimumMarkerPower = medianLocalPower * minimumLocalPowerRatio;
    if (diagnostics && onPower >= maximumPower * 0.001) {
      diagnosticCandidates.push({ time: start * hopSize / sampleRate, patternCorrelation, contrast, onPower, offPower });
      if (diagnosticCandidates.length > 16) {
        diagnosticCandidates.sort((left, right) => right.patternCorrelation - left.patternCorrelation);
        diagnosticCandidates.length = 8;
      }
    }
    const minimumUsablePulses = frequencySequence?.length ? Math.ceil(pulseCount * 0.8) : Math.ceil(pulseCount * 0.6);
    if (onPower < minimumMarkerPower || onPower < 1e-8 || usablePulseContrasts.length < Math.max(1, minimumUsablePulses)) continue;
    if (patternCorrelation < threshold) continue;
    candidates.push({
      time: start * hopSize / sampleRate,
      confidence: patternCorrelation * contrast,
      patternCorrelation,
      contrast,
      onPower,
      offPower,
    });
  }

  if (diagnostics) {
    diagnostics.maximumPower = maximumPower;
    diagnostics.topCandidates = diagnosticCandidates
      .sort((left, right) => right.patternCorrelation - left.patternCorrelation)
      .slice(0, 8);
  }

  const selected = [];
  for (const candidate of candidates.sort((left, right) => right.confidence - left.confidence)) {
    if (selected.some(existing => Math.abs(existing.time - candidate.time) < markerDurationSeconds * 0.8)) continue;
    selected.push(candidate);
  }
  return selected.sort((left, right) => left.time - right.time);
};

/** Selects the strongest plausible pair for two known tracker rows. */
export const selectExpectedMarkerPair = (
  candidates,
  expectedStartMs,
  expectedIntervalMs,
  { firstMarkerToleranceMs = Math.max(350, expectedIntervalMs / 2) } = {},
) => {
  const markers = (candidates ?? []).filter(marker => Number.isFinite(marker.time));
  let bestPair = { first: null, second: null, intervalMs: Infinity, errorMs: Infinity, minimumPower: 0, confidence: 0, score: Infinity };
  for (const firstMarker of markers) {
    const firstMs = firstMarker.time * 1_000;
    const startErrorMs = Math.abs(firstMs - expectedStartMs);
    if (startErrorMs > firstMarkerToleranceMs) continue;
    for (const secondMarker of markers) {
      if (secondMarker.time <= firstMarker.time) continue;
      const intervalMs = (secondMarker.time - firstMarker.time) * 1_000;
      const errorMs = Math.abs(intervalMs - expectedIntervalMs);
      const minimumPower = Math.min(firstMarker.onPower ?? 1, secondMarker.onPower ?? 1);
      const confidenceOf = marker => marker.confidence ?? ((marker.patternCorrelation ?? 1) * (marker.contrast ?? 1));
      const confidence = Math.min(confidenceOf(firstMarker), confidenceOf(secondMarker));
      // Timing determines whether the pair is usable. Confidence and power break
      // close timing ties so a loud music transient cannot win over the coded tone.
      const score = (errorMs * 4) + (startErrorMs * 0.02)
        - (25 * Math.max(0, Math.min(1, confidence)))
        - (5 * Math.log10(Math.max(1e-6, minimumPower)));
      if (score < bestPair.score) {
        bestPair = { first: firstMarker.time, second: secondMarker.time, intervalMs, errorMs, minimumPower, confidence, score };
      }
    }
  }
  return bestPair;
};

/** Aligns a distributed schedule to noisy detections without letting an early distractor consume a later true onset. */
export const fitScheduledMarkerClock = (referenceOnsets, targetOnsets, toleranceSeconds = 0.08) => {
  if (referenceOnsets.length < 3 || targetOnsets.length < 3) return null;
  let best;
  for (let slopeIndex = 0; slopeIndex <= 30; slopeIndex += 1) {
    const slope = 0.97 + slopeIndex * 0.002;
    for (let interceptIndex = 0; interceptIndex <= 100; interceptIndex += 1) {
      const interceptSeconds = interceptIndex * 0.01;
      const pairs = [];
      let targetIndex = 0;
      for (const reference of referenceOnsets) {
        const expected = interceptSeconds + slope * reference;
        while (targetIndex < targetOnsets.length && targetOnsets[targetIndex] < expected - toleranceSeconds) targetIndex += 1;
        let closestIndex = -1;
        let closestError = Infinity;
        for (let candidateIndex = targetIndex; candidateIndex < targetOnsets.length && targetOnsets[candidateIndex] <= expected + toleranceSeconds; candidateIndex += 1) {
          const error = Math.abs(targetOnsets[candidateIndex] - expected);
          if (error < closestError) {
            closestError = error;
            closestIndex = candidateIndex;
          }
        }
        if (closestIndex < 0) continue;
        pairs.push({ reference, target: targetOnsets[closestIndex], error: closestError });
        targetIndex = closestIndex + 1;
      }
      if (pairs.length < 3) continue;
      const residualRms = Math.sqrt(pairs.reduce((sum, pair) => sum + pair.error ** 2, 0) / pairs.length);
      if (!best || pairs.length > best.pairs.length || pairs.length === best.pairs.length && residualRms < best.residualRms) {
        best = { slope, interceptSeconds, pairs, residualRms };
      }
    }
  }
  if (!best) return null;
  const referenceMean = best.pairs.reduce((sum, pair) => sum + pair.reference, 0) / best.pairs.length;
  const targetMean = best.pairs.reduce((sum, pair) => sum + pair.target, 0) / best.pairs.length;
  let covariance = 0;
  let variance = 0;
  for (const pair of best.pairs) {
    covariance += (pair.reference - referenceMean) * (pair.target - targetMean);
    variance += (pair.reference - referenceMean) ** 2;
  }
  const fittedSlope = covariance / Math.max(1e-12, variance);
  const fittedIntercept = targetMean - fittedSlope * referenceMean;
  const residuals = best.pairs.slice(2).map(pair => pair.target - fittedIntercept - fittedSlope * pair.reference);
  return {
    slope: fittedSlope,
    interceptSeconds: fittedIntercept,
    pairedOnsets: best.pairs.length,
    validationOnsets: residuals.length,
    validationResidualRmsSeconds: Math.sqrt(residuals.reduce((sum, residual) => sum + residual ** 2, 0) / Math.max(1, residuals.length)),
    pairs: best.pairs,
  };
};
