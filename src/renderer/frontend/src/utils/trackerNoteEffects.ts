export type TrackerEffectGroup = 'pitch' | 'volume' | 'pan' | 'sample' | 'timing' | 'sequence';
export interface TrackerEffectChoice { id: string; parameter: number }
export interface TrackerEffectDefinition {
  id: string; name: string; group: TrackerEffectGroup; effect: number;
  scope: 'note' | 'row';
  subcommand?: number; defaultParameter: number; min: number; max: number;
}

const groups: Record<string, TrackerEffectGroup> = {
  arpeggio: 'pitch', pitchUp: 'pitch', pitchDown: 'pitch', portamento: 'pitch', vibrato: 'pitch',
  fineVibrato: 'pitch', finePitchUp: 'pitch', finePitchDown: 'pitch', glissando: 'pitch', vibratoWave: 'pitch',
  volume: 'volume', volumeSlide: 'volume', globalVolume: 'volume', globalVolumeSlide: 'volume',
  channelVolume: 'volume', channelVolumeSlide: 'volume', tremolo: 'volume', tremoloWave: 'volume',
  fineVolumeUp: 'volume', fineVolumeDown: 'volume', tremor: 'volume',
  portamentoVolume: 'volume', vibratoVolume: 'volume',
  pan: 'pan', panSlide: 'pan', panbrello: 'pan', panbrelloWave: 'pan', surround: 'pan',
  orderJump: 'sequence', patternBreak: 'sequence', patternLoop: 'sequence', patternDelay: 'sequence',
  speed: 'timing', tempo: 'timing', noteCut: 'timing', noteOff: 'timing', noteDelay: 'timing',
  retrigger: 'timing', finePatternDelay: 'timing',
};

export function trackerNoteEffectCatalog(format: string): TrackerEffectDefinition[] {
  const modXm = format === 'MOD' || format === 'XM';
  const result: TrackerEffectDefinition[] = [];
  const add = (name: string, effect: number, parameter = 1, max = 255, min = 0, subcommand?: number) => {
    result.push({ id: subcommand === undefined ? name : `${name}:${effect}:${subcommand}`, name,
      scope: ['orderJump', 'patternBreak', 'patternLoop', 'patternDelay', 'finePatternDelay', 'speed', 'tempo',
        'globalVolume', 'globalVolumeSlide', 'channelVolume', 'channelVolumeSlide', 'macro', 'filter'].includes(name) ? 'row' : 'note',
      group: groups[name] ?? 'sample', effect, subcommand, defaultParameter: parameter, min, max });
  };
  if (modXm) {
    add('arpeggio', 0, 0x37); add('pitchUp', 1, 4); add('pitchDown', 2, 4);
    add('portamento', 3, 4); add('vibrato', 4, 0x47); add('portamentoVolume', 5); add('vibratoVolume', 6); add('tremolo', 7, 0x47);
    add('pan', 8, 128); add('sampleOffset', 9); add('volumeSlide', 10);
    add('orderJump', 11, 0); add('volume', 12, 64, 64); add('patternBreak', 13, 0);
    add('speed', 15, 6, 31, 1); add('tempo', 15, 125, 255, 32);
    const extended = ['filter', 'finePitchUp', 'finePitchDown', 'glissando', 'vibratoWave', 'fineTune',
      'patternLoop', 'tremoloWave', 'pan', 'retrigger', 'fineVolumeUp', 'fineVolumeDown',
      'noteCut', 'noteDelay', 'patternDelay', 'invertLoop'];
    extended.forEach((name, sub) => {
      if (format === 'XM' && (sub === 0 || sub === 15)) return;
      add(name, 14, sub === 6 ? 2 : sub === 8 ? 8 : 1, 15, 0, sub);
    });
    if (format === 'XM') {
      add('globalVolume', 16, 64, 64); add('globalVolumeSlide', 17);
      add('noteOff', 20, 0); add('envelopePosition', 21, 0); add('panSlide', 25);
      add('retrigger', 27, 0x93); add('tremor', 29, 0x34);
      add('finePitchUp', 33, 1, 15, 0, 1); add('finePitchDown', 33, 1, 15, 0, 2);
    }
  } else {
    add('speed', 1, 6, 255, 1); add('orderJump', 2, 0); add('patternBreak', 3, 0);
    add('volumeSlide', 4); add('pitchDown', 5, 4); add('pitchUp', 6, 4);
    add('portamento', 7, 4); add('vibrato', 8, 0x47); add('tremor', 9, 0x34);
    add('arpeggio', 10, 0x37); add('vibratoVolume', 11); add('portamentoVolume', 12); add('channelVolume', 13, 64, 64); add('channelVolumeSlide', 14);
    add('sampleOffset', 15); add('panSlide', 16); add('retrigger', 17, 0x93); add('tremolo', 18, 0x47);
    add('tempo', 20, 125, 255, 32); add('fineVibrato', 21, 0x47);
    add('globalVolume', 22, format === 'IT' ? 128 : 64, format === 'IT' ? 128 : 64);
    add('globalVolumeSlide', 23); add('pan', 24, format === 'IT' ? 128 : 64, format === 'IT' ? 255 : 128);
    add('panbrello', 25, 0x47); add('macro', 26, 0);
    const extended: Record<number, string> = { 1: 'glissando', 2: 'fineTune', 3: 'vibratoWave',
      4: 'tremoloWave', 5: 'panbrelloWave', 6: 'finePatternDelay', 7: 'noteAction', 8: 'pan',
      9: 'surround', 10: 'highOffset', 11: 'patternLoop', 12: 'noteCut', 13: 'noteDelay', 14: 'patternDelay', 15: 'macro' };
    Object.entries(extended).forEach(([sub, name]) => add(name, 19, name === 'patternLoop' ? 2 : name === 'pan' ? 8 : 1, 15, 0, Number(sub)));
  }
  return result;
}

export function decodeTrackerNoteEffects(format: string, effect: number, parameter: number): TrackerEffectChoice[] {
  if (effect <= 0 && parameter === 0) return [];
  const modXm = format === 'MOD' || format === 'XM';
  if (effect === (modXm ? 5 : 12)) return [{ id: 'portamento', parameter: 0 }, { id: 'volumeSlide', parameter }];
  if (effect === (modXm ? 6 : 11)) return [{ id: 'vibrato', parameter: 0 }, { id: 'volumeSlide', parameter }];
  const match = trackerNoteEffectCatalog(format).find(item => item.effect === effect
    && (item.subcommand === undefined || item.subcommand === parameter >> 4)
    && (effect !== 15 || !modXm || (parameter < 32 ? item.name === 'speed' : item.name === 'tempo')));
  return [{ id: match?.id ?? `native:${effect}`, parameter: match?.subcommand === undefined ? parameter : parameter & 15 }];
}

export function canCombineTrackerNoteEffects(ids: readonly string[]): boolean {
  if (ids.length <= 1) return true;
  return ids.length === 2 && ids.includes('volumeSlide') && (ids.includes('portamento') || ids.includes('vibrato'));
}

export function encodeTrackerNoteEffects(format: string, choices: readonly TrackerEffectChoice[]): { effect: number; parameter: number } | null {
  if (!canCombineTrackerNoteEffects(choices.map(item => item.id))) return null;
  if (!choices.length) return { effect: 0, parameter: 0 };
  if (choices.length === 2) {
    const modXm = format === 'MOD' || format === 'XM';
    return { effect: choices.some(item => item.id === 'portamento') ? (modXm ? 5 : 12) : (modXm ? 6 : 11),
      parameter: choices.find(item => item.id === 'volumeSlide')!.parameter & 255 };
  }
  const choice = choices[0];
  const definition = trackerNoteEffectCatalog(format).find(item => item.id === choice.id);
  if (!definition) {
    const native = /^native:(\d+)$/.exec(choice.id);
    return native ? { effect: Number(native[1]), parameter: choice.parameter & 255 } : null;
  }
  const parameter = Math.max(definition.min, Math.min(definition.max, Math.trunc(choice.parameter)));
  return { effect: definition.effect, parameter: definition.subcommand === undefined ? parameter : definition.subcommand << 4 | parameter };
}
