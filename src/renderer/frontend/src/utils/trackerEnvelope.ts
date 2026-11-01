export type TrackerEnvelope = {
  points: Array<{ tick: number; value: number }>;
  sustain: number;
  loopStart: number;
  loopEnd: number;
  enabled: boolean;
  sustainEnabled?: boolean;
  loopEnabled?: boolean;
  sustainStart?: number;
  sustainEnd?: number;
};

export type TrackerEnvelopeFrameTime = { frame: number; time: number };

export function trackerEnvelopeFrameTimes(
  rowTimes: readonly number[],
  rowTickDurations: readonly number[],
  rowTickCounts: readonly number[],
  playbackStart: number,
  firstRow: number,
  noteStart: number,
  noteEnd: number,
): TrackerEnvelopeFrameTime[] {
  const frames: TrackerEnvelopeFrameTime[] = [{ frame: 0, time: noteStart }];
  let frame = 1;
  for (let rowIndex = firstRow; rowIndex < rowTimes.length; rowIndex += 1) {
    const rowStart = playbackStart + rowTimes[rowIndex];
    if (rowStart >= noteEnd) break;
    const tickDuration = rowTickDurations[rowIndex] ?? 0;
    const tickCount = rowTickCounts[rowIndex] ?? 0;
    if (tickDuration <= 0 || tickCount <= 0) continue;
    for (let tick = 0; tick < tickCount; tick += 1) {
      const time = rowStart + tick * tickDuration;
      if (time <= noteStart + 1e-7) continue;
      if (time >= noteEnd) break;
      frames.push({ frame, time });
      frame += 1;
    }
  }
  return frames;
}

export function trackerEnvelopeValueAt(envelope: TrackerEnvelope, frame: number, releasedAtFrame: boolean | number): number {
  if (!envelope.points.length) return 64;
  const points = envelope.points;
  const lastFrame = Math.max(0, points[points.length - 1].tick);
  const released = typeof releasedAtFrame === 'boolean' ? releasedAtFrame : frame >= releasedAtFrame;
  let effectiveFrame = Math.max(0, frame);
  const sustainStartFrame = points[envelope.sustainStart ?? envelope.sustain]?.tick;
  const sustainEndFrame = points[envelope.sustainEnd ?? envelope.sustain]?.tick;
  if (envelope.sustainEnabled && sustainStartFrame !== undefined && sustainEndFrame !== undefined && sustainEndFrame > sustainStartFrame) {
    const loopLength = sustainEndFrame - sustainStartFrame + 1;
    if (released && typeof releasedAtFrame === 'number' && frame >= releasedAtFrame && releasedAtFrame > sustainEndFrame) {
      const releasePosition = sustainStartFrame + ((releasedAtFrame - sustainEndFrame - 1) % loopLength);
      effectiveFrame = releasePosition + (frame - releasedAtFrame);
    } else if (!released && effectiveFrame > sustainEndFrame) {
      effectiveFrame = sustainStartFrame + ((effectiveFrame - sustainEndFrame - 1) % loopLength);
    }
  } else if (!released && envelope.sustainEnabled && sustainEndFrame !== undefined && effectiveFrame >= sustainEndFrame) {
    effectiveFrame = sustainEndFrame;
  }
  const loopStartFrame = points[envelope.loopStart]?.tick;
  const loopEndFrame = points[envelope.loopEnd]?.tick;
  if (envelope.loopEnabled && loopStartFrame !== undefined && loopEndFrame !== undefined && loopEndFrame > loopStartFrame && effectiveFrame > loopEndFrame) {
    const loopLength = loopEndFrame - loopStartFrame + 1;
    effectiveFrame = loopStartFrame + ((effectiveFrame - loopEndFrame - 1) % loopLength);
  } else {
    effectiveFrame = Math.min(lastFrame, effectiveFrame);
  }
  let previous = points[0];
  for (const point of points) {
    if (point.tick >= effectiveFrame) {
      if (point.tick === previous.tick) return point.value;
      const ratio = (effectiveFrame - previous.tick) / (point.tick - previous.tick);
      return previous.value + (point.value - previous.value) * Math.max(0, Math.min(1, ratio));
    }
    previous = point;
  }
  return previous.value;
}

export function trackerEnvelopeFadeoutAt(fadeoutRate: number, frame: number, releasedAtFrame: number, fadeoutMaximum = 65536): number {
  if (fadeoutRate <= 0 || frame < releasedAtFrame) return 1;
  return Math.max(0, (fadeoutMaximum - fadeoutRate * (frame - releasedAtFrame)) / fadeoutMaximum);
}

/** Apply an XM panning envelope relative to the sample's current pan. */
export function trackerEnvelopePanningAt(basePan: number, envelopeValue: number): number {
  const pan = Math.max(-1, Math.min(1, basePan));
  const envelopeOffset = (Math.max(0, Math.min(64, envelopeValue)) - 32) / 32;
  return Math.max(-1, Math.min(1, pan + envelopeOffset * (1 - Math.abs(pan))));
}
