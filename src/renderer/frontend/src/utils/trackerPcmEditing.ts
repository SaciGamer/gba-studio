export type TrackerPcmEditOperation = 'normalize' | 'remove-dc' | 'reverse' | 'fade-out' | 'crossfade' | 'draw' | 'trim';
export type TrackerPcmEditRange = { start: number; end: number };
export type TrackerPcmFrameEdit = { frame: number; value: number };

/** Applies a destructive edit and returns the exact signed 8-bit PCM used by the GBA writers. */
export const editTrackerPcm = (
  source: Float32Array,
  operation: TrackerPcmEditOperation,
  range?: TrackerPcmEditRange,
  frameEdits: readonly TrackerPcmFrameEdit[] = [],
): Int8Array => {
  const values = Float64Array.from(source, value => Number.isFinite(value) ? value : 0);
  const start = Math.max(0, Math.min(values.length, Math.trunc(range?.start ?? 0)));
  const end = Math.max(start, Math.min(values.length, Math.trunc(range?.end ?? values.length)));
  const selected = values.subarray(start, end);

  if (operation === 'trim') return quantize(selected);

  if (operation === 'draw') {
    for (const edit of frameEdits) {
      const frame = Math.trunc(edit.frame);
      if (frame >= start && frame < end) values[frame] = Number.isFinite(edit.value) ? Math.max(-1, Math.min(1, edit.value)) : 0;
    }
  } else if (operation === 'reverse') {
    for (let left = 0, right = selected.length - 1; left < right; left += 1, right -= 1) {
      const value = selected[left];
      selected[left] = selected[right];
      selected[right] = value;
    }
  } else if (operation === 'remove-dc' && selected.length) {
    let mean = 0;
    for (const value of selected) mean += value;
    mean /= selected.length;
    for (let index = 0; index < selected.length; index += 1) selected[index] -= mean;
  } else if (operation === 'normalize' && selected.length) {
    let peak = 0;
    for (const value of selected) peak = Math.max(peak, Math.abs(value));
    if (peak > 0) for (let index = 0; index < selected.length; index += 1) selected[index] /= peak;
  } else if (operation === 'fade-out' && selected.length > 1) {
    const denominator = selected.length - 1;
    for (let index = 0; index < selected.length; index += 1) selected[index] *= 1 - index / denominator;
  } else if (operation === 'crossfade' && selected.length > 1) {
    const fadeLength = Math.floor(selected.length / 2);
    const loopStartValue = selected[0];
    for (let index = 0; index < fadeLength; index += 1) {
      const progress = (index + 1) / fadeLength;
      const tailIndex = selected.length - fadeLength + index;
      selected[tailIndex] = selected[tailIndex] * (1 - progress) + loopStartValue * progress;
    }
  }

  return quantize(values);
};

const quantize = (values: ArrayLike<number>): Int8Array => {
  const result = new Int8Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    result[index] = Math.max(-128, Math.min(127, Math.round(Math.max(-1, Math.min(1, values[index])) * 127)));
  }
  return result;
};
