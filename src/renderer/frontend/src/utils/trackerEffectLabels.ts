type Translate = (key: string, values?: Record<string, string | number>) => string;

const xm: Record<number, string> = {
  0: 'arpeggio', 1: 'pitchUp', 2: 'pitchDown', 3: 'portamento', 4: 'vibrato',
  5: 'portamentoVolume', 6: 'vibratoVolume', 7: 'tremolo', 8: 'pan', 9: 'sampleOffset',
  10: 'volumeSlide', 11: 'orderJump', 12: 'volume', 13: 'patternBreak', 14: 'extended',
  15: 'speedTempo', 16: 'globalVolume', 17: 'globalVolumeSlide', 20: 'noteOff',
  21: 'envelopePosition', 25: 'panSlide', 27: 'retrigger', 29: 'tremor', 33: 'finePortamento',
};
const s3m: Record<number, string> = {
  1: 'speed', 2: 'orderJump', 3: 'patternBreak', 4: 'volumeSlide', 5: 'pitchDown',
  6: 'pitchUp', 7: 'portamento', 8: 'vibrato', 9: 'tremor', 10: 'arpeggio',
  11: 'vibratoVolume', 12: 'portamentoVolume', 13: 'channelVolume', 14: 'channelVolumeSlide',
  15: 'sampleOffset', 16: 'panSlide', 17: 'retrigger', 18: 'tremolo', 19: 'extended',
  20: 'tempo', 21: 'fineVibrato', 22: 'globalVolume', 23: 'globalVolumeSlide', 24: 'pan',
  25: 'panbrello', 26: 'macro',
};
const extendedXm = ['filter', 'finePitchUp', 'finePitchDown', 'glissando', 'vibratoWave', 'fineTune', 'patternLoop', 'tremoloWave', 'pan', 'retrigger', 'fineVolumeUp', 'fineVolumeDown', 'noteCut', 'noteDelay', 'patternDelay', 'invertLoop'];
const extendedS3m: Record<number, string> = { 1: 'glissando', 2: 'fineTune', 3: 'vibratoWave', 4: 'tremoloWave', 5: 'panbrelloWave', 6: 'finePatternDelay', 7: 'noteAction', 8: 'pan', 9: 'surround', 10: 'highOffset', 11: 'patternLoop', 12: 'noteCut', 13: 'noteDelay', 14: 'patternDelay', 15: 'macro' };
const hex = (value: number) => (value & 255).toString(16).toUpperCase().padStart(2, '0');

/** Resolve effect numbers in their module format; zero with a parameter is arpeggio in MOD/XM. */
export function trackerEffectLabel(format: string, effect: number, parameter: number | undefined, t: Translate): string {
  const modXm = format === 'MOD' || format === 'XM';
  const command = format === 'IT' ? effect & 31 : effect & 255;
  let name = (modXm ? xm : s3m)[command] ?? 'unknown';
  if (parameter !== undefined && name === 'extended') {
    name = (modXm ? extendedXm[parameter >> 4] : extendedS3m[parameter >> 4]) ?? 'extended';
  }
  if (name === 'speedTempo' && parameter !== undefined) name = parameter < 32 ? 'speed' : 'tempo';
  let label = t(`music.effects.${name}`);
  if (parameter !== undefined && name === 'pan') {
    const extended = modXm ? command === 14 : command === 19;
    const max = extended ? 15 : format === 'S3M' ? 128 : 255;
    const value = extended ? parameter & 15 : parameter;
    if (format === 'S3M' && command === 24 && parameter === 0xa4) label = t('music.effects.surround');
    else {
      const center = extended ? 8 : format === 'S3M' ? 64 : 128;
      const pan = value <= center ? (value - center) / center : (value - center) / Math.max(1, max - center);
      label += `: ${Math.abs(pan) < 0.01 ? t('music.effects.center') : t(pan < 0 ? 'music.effects.left' : 'music.effects.right', { percent: Math.round(Math.abs(pan) * 100) })}`;
    }
  }
  return `${label} (${hex(command)}${parameter === undefined ? '' : ` ${hex(parameter)}`})`;
}
