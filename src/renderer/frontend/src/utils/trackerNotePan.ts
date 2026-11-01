export type TrackerNotePanFormat = 'MOD' | 'XM' | 'S3M' | 'IT';

export interface EncodedTrackerPan {
  effect: number;
  parameter: number;
}

export function normalizeTrackerPan(pan: number): number {
  return Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
}

/** Snaps authored note pan to the nine labeled positions in the note inspector. */
export function quantizeTrackerNotePan(pan: number): number {
  return (Math.round((normalizeTrackerPan(pan) + 1) * 4) / 4) - 1;
}

/** Encodes the closest pan level available in the note's tracker format. */
export function encodeTrackerNotePan(format: TrackerNotePanFormat, pan: number): EncodedTrackerPan {
  const value = quantizeTrackerNotePan(pan);
  if (format === 'MOD') {
    const nibble = Math.round((value + 1) * 8);
    return { effect: 14, parameter: 0x80 | Math.max(0, Math.min(15, nibble)) };
  }
  if (format === 'S3M') {
    // S8x carries a 4-bit position in 16-unit intervals, centered on nibble 8.
    const nibble = Math.round((value + 1) * 8);
    return { effect: 19, parameter: 0x80 | Math.max(0, Math.min(15, nibble)) };
  }
  const parameter = Math.max(0, Math.min(255, Math.round((value + 1) * 128)));
  if (format === 'XM') return { effect: 8, parameter };
  return { effect: 24, parameter };
}

function decodeBytePan(parameter: number): number {
  const value = Math.max(0, Math.min(255, parameter & 0xff));
  return (value - 128) / 128;
}

const decodeNibblePan = (parameter: number) => (parameter & 15) / 8 - 1;

/** Reads the pan effect conventions currently supported by each importer. */
export function decodeTrackerNotePan(format: TrackerNotePanFormat, effect: number, parameter: number): number {
  const command = effect & 0xff;
  const value = parameter & 0xff;
  if ((format === 'MOD' && command === 14 && (value >> 4) === 8)
    || (format === 'XM' && command === 14 && (value >> 4) === 8)
    || (format === 'IT' && command === 19 && (value >> 4) === 8)) {
    return decodeNibblePan(value);
  }
  if ((format === 'XM' && command === 8) || (format === 'IT' && command === 24)) {
    return decodeBytePan(value);
  }
  if (format === 'S3M' && command === 19 && (value >> 4) === 8) {
    return decodeNibblePan(value);
  }
  return 0;
}

export function isTrackerNotePanEffect(format: TrackerNotePanFormat, effect: number, parameter: number): boolean {
  const command = effect & 0xff;
  const value = parameter & 0xff;
  return (format === 'MOD' && command === 14 && (value >> 4) === 8)
    || (format === 'XM' && (command === 8 || command === 14 && (value >> 4) === 8))
    || (format === 'S3M' && command === 19 && (value >> 4) === 8)
    || (format === 'IT' && (command === 24 || command === 19 && (value >> 4) === 8));
}
