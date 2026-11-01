import assert from 'node:assert/strict';
import { detectPulsedToneMarkers, fitScheduledMarkerClock, selectExpectedMarkerPair } from './helpers/mod-sync-marker.mjs';

const sampleRate = 48_000;
const carrierFrequency = 2_200;
const sourceSampleRate = 8_363;
const pulsePeriodFrames = 128;
const activeFrames = 64;
const pulseCount = 5;

const makeMix = (durationSeconds, markerStarts, includePersistentCarrier = true, markerAmplitude = 0.72, musicAmplitude = 0.22, musicFrequency = carrierFrequency) => {
  const signal = new Float32Array(Math.ceil(durationSeconds * sampleRate));
  if (includePersistentCarrier) {
    for (let frame = 0; frame < signal.length; frame += 1) {
      signal[frame] = musicAmplitude * Math.sin((2 * Math.PI * musicFrequency * frame) / sampleRate);
    }
  }
  for (const markerStart of markerStarts) {
    for (let frame = Math.max(0, Math.floor(markerStart * sampleRate)); frame < signal.length; frame += 1) {
      const sourceFrame = Math.floor(((frame / sampleRate) - markerStart) * sourceSampleRate);
      const pulseFrame = sourceFrame % pulsePeriodFrames;
      if (sourceFrame < 0 || sourceFrame >= pulsePeriodFrames * pulseCount) continue;
      if (pulseFrame < activeFrames) {
        signal[frame] += markerAmplitude * Math.sin((2 * Math.PI * carrierFrequency * sourceFrame) / sourceSampleRate);
      }
    }
  }
  return signal;
};

const expected = [0.4, 1.35, 2.8];
const mixedWithMusic = makeMix(4, expected);
const detections = detectPulsedToneMarkers(mixedWithMusic, sampleRate, carrierFrequency);
assert.equal(detections.length, expected.length, `expected ${expected.length} markers; got ${JSON.stringify(detections)}`);
for (const [index, time] of expected.entries()) {
  assert.ok(Math.abs(detections[index].time - time) < 0.004, `marker ${index} onset error was ${(detections[index].time - time) * 1_000} ms`);
  assert.ok(detections[index].patternCorrelation >= 0.72);
}

const selectedPair = selectExpectedMarkerPair([
  { time: 0.02, onPower: 4, confidence: 0.5 },
  { time: 0.82, onPower: 4, confidence: 0.5 },
  { time: 0.1, onPower: 2, confidence: 0.95 },
  { time: 0.9, onPower: 2, confidence: 0.95 },
  { time: 0.18, onPower: 5, confidence: 0.99 },
  { time: 0.7, onPower: 5, confidence: 0.99 },
], 0, 800);
assert.equal(selectedPair.first, 0.1, `the coded, correctly timed marker pair should beat a louder false transient pair: ${JSON.stringify(selectedPair)}`);
assert.equal(selectedPair.second, 0.9);
assert.equal(selectedPair.errorMs, 0);

const musicalOnly = makeMix(4, [], true);
assert.deepEqual(detectPulsedToneMarkers(musicalOnly, sampleRate, carrierFrequency), [], 'a sustained 2.2 kHz musical partial must not look like a marker');

const quietMarkers = makeMix(4, expected, true, 0.05, 0.8, 1_500);
const quietDetections = detectPulsedToneMarkers(quietMarkers, sampleRate, carrierFrequency, { threshold: 0.55, minimumPowerRatio: 0.001 });
assert.equal(quietDetections.length, expected.length, `low-level markers under loud music should remain detectable; got ${JSON.stringify(quietDetections)}`);
for (const [index, time] of expected.entries()) {
  assert.ok(Math.abs(quietDetections[index].time - time) < 0.02, `quiet marker ${index} onset error was ${(quietDetections[index].time - time) * 1_000} ms`);
}

const codedFrequencies = [6, 8, 10, 12, 14].map(cycles => cycles * sourceSampleRate / activeFrames);
const makeCodedMix = (durationSeconds, markerStarts) => {
  const signal = new Float32Array(Math.ceil(durationSeconds * sampleRate));
  for (let frame = 0; frame < signal.length; frame += 1) {
    signal[frame] = codedFrequencies.reduce((sum, frequency) => sum + 0.04 * Math.sin((2 * Math.PI * frequency * frame) / sampleRate), 0);
  }
  for (const markerStart of markerStarts) {
    const firstFrame = Math.max(0, Math.floor(markerStart * sampleRate));
    for (let frame = firstFrame; frame < signal.length; frame += 1) {
      const sourceFrame = Math.floor(((frame / sampleRate) - markerStart) * sourceSampleRate);
      if (sourceFrame >= pulsePeriodFrames * pulseCount) continue;
      const pulse = Math.floor(sourceFrame / pulsePeriodFrames);
      const pulseFrame = sourceFrame % pulsePeriodFrames;
      if (pulseFrame < activeFrames) {
        signal[frame] += 0.2 * Math.sin((2 * Math.PI * codedFrequencies[pulse] * pulseFrame) / sourceSampleRate);
      }
    }
  }
  return signal;
};
const codedMarkers = makeCodedMix(4, expected);
const codedDetections = detectPulsedToneMarkers(codedMarkers, sampleRate, codedFrequencies[0], {
  sourceSampleRate,
  framesPerPulse: pulsePeriodFrames,
  activeFrames,
  pulseCount,
  frequencySequence: codedFrequencies,
  threshold: 0.72,
  minimumPowerRatio: 0.005,
});
assert.equal(codedDetections.length, expected.length, `expected ${expected.length} coded markers; got ${JSON.stringify(codedDetections)}`);
for (const [index, time] of expected.entries()) {
  assert.ok(Math.abs(codedDetections[index].time - time) < 0.006, `coded marker ${index} onset error was ${(codedDetections[index].time - time) * 1_000} ms`);
}

const longRate = 12_000;
const longDuration = 90;
const longSignal = new Float32Array(longRate * longDuration);
for (let frame = 0; frame < longSignal.length; frame += 1) {
  const time = frame / longRate;
  longSignal[frame] = 0.02 * Math.sin((2 * Math.PI * 700 * frame) / longRate);
  if (time >= 35 && time < 55) longSignal[frame] += 0.9 * Math.sin((2 * Math.PI * codedFrequencies[1] * frame) / longRate);
}
const longMarkerStarts = Array.from({ length: 62 }, (_, index) => 0.4 + index * 1.4);
for (const markerStart of longMarkerStarts) {
  for (let sourceFrame = 0; sourceFrame < pulsePeriodFrames * pulseCount; sourceFrame += 1) {
    if (sourceFrame % pulsePeriodFrames >= activeFrames) continue;
    const pulse = Math.floor(sourceFrame / pulsePeriodFrames);
    const pulseFrame = sourceFrame % pulsePeriodFrames;
    const frame = Math.round((markerStart + sourceFrame / sourceSampleRate) * longRate);
    if (frame < longSignal.length) longSignal[frame] += 0.12 * Math.sin((2 * Math.PI * codedFrequencies[pulse] * pulseFrame) / sourceSampleRate);
  }
}
const longDetections = detectPulsedToneMarkers(longSignal, longRate, codedFrequencies[0], {
  sourceSampleRate,
  framesPerPulse: pulsePeriodFrames,
  activeFrames,
  pulseCount,
  frequencySequence: codedFrequencies,
  threshold: 0.72,
  minimumPowerRatio: 0.015,
});
const missingLongMarkers = longMarkerStarts.filter(time => {
  const nearest = longDetections.reduce((best, detection) => Math.abs(detection.time - time) < Math.abs(best - time) ? detection.time : best, longDetections[0]?.time ?? Number.NaN);
  return !Number.isFinite(nearest) || Math.abs(nearest - time) >= 0.02;
});
assert.ok(missingLongMarkers.length <= 2, `long captures must retain quiet markers after a louder passage; got ${longDetections.length}/${longMarkerStarts.length}, missing ${missingLongMarkers.join(',')}`);

const scheduledOnsets = Array.from({ length: 81 }, (_, index) => index * 0.95586);
const encodedOnsets = scheduledOnsets.map(time => 0.998 * time + 0.37);
const noisyOnsets = encodedOnsets.flatMap(time => [time - 0.035, time, time + 0.028]).sort((left, right) => left - right);
const alignedClock = fitScheduledMarkerClock(scheduledOnsets, noisyOnsets, 0.05);
assert.equal(alignedClock.pairedOnsets, scheduledOnsets.length, 'nearest scheduled candidates should beat earlier distractors within the same timing window');
assert.ok(Math.abs(alignedClock.slope - 0.998) < 1e-9, 'the fitted clock should recover the encoded sample-clock scale');
const missingClock = fitScheduledMarkerClock(scheduledOnsets, encodedOnsets.filter((_, index) => ![7, 34, 70].includes(index)), 0.05);
assert.equal(missingClock.pairedOnsets, scheduledOnsets.length - 3, 'the matcher should preserve a missing-marker count rather than shifting every later event');

console.log(`Pulse-marker detector passed (${detections.length} standard, ${quietDetections.length} low-level, ${codedDetections.length} coded and ${longDetections.length}/${longMarkerStarts.length} long-run markers; sustained carrier rejected).`);
