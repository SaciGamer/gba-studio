import type { TrackerPatternEvent } from './trackerModule';
import { decodeTrackerNoteEffects, trackerNoteEffectCatalog } from './trackerNoteEffects';

const codes: Record<string, string> = {
  arpeggio: 'AR', pitchUp: 'PU', pitchDown: 'PD', portamento: 'PT', vibrato: 'VI',
  fineVibrato: 'FV', finePitchUp: 'FU', finePitchDown: 'FD', glissando: 'GL', vibratoWave: 'VW',
  tremolo: 'TR', tremoloWave: 'TW', tremor: 'TM', volume: 'VO', volumeSlide: 'VS',
  fineVolumeUp: 'VU', fineVolumeDown: 'VD', channelVolume: 'CV', channelVolumeSlide: 'CS',
  globalVolume: 'GV', globalVolumeSlide: 'GS', pan: 'PA', panSlide: 'PS', panbrello: 'PB',
  panbrelloWave: 'PW', surround: 'SU', sampleOffset: 'SO', highOffset: 'HO', fineTune: 'FT',
  filter: 'FI', invertLoop: 'IL', envelopePosition: 'EP', noteAction: 'NA', macro: 'MC',
  orderJump: 'JP', patternBreak: 'BR', patternLoop: 'LP', patternDelay: 'DL', finePatternDelay: 'DT',
  speed: 'SP', tempo: 'BP', noteOff: 'NO', noteCut: 'NC', noteDelay: 'ND', retrigger: 'RT',
};
export interface TrackerFxVisual {
  id: string; name: string; code: string; color: string; parameter: number;
}

export function trackerFxVisuals(format: string, effect: number, parameter: number): TrackerFxVisual[] {
  if (effect < 0) return [];
  const catalog = trackerNoteEffectCatalog(format);
  return decodeTrackerNoteEffects(format, effect, parameter).map(choice => {
    const definition = catalog.find(item => item.id === choice.id);
    const name = definition?.name ?? 'unknown';
    const hash = Array.from(choice.id).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
    return { id: choice.id, name, code: definition?.effect === 33 ? (definition.subcommand === 1 ? 'XU' : 'XD') : codes[name] ?? 'FX',
      color: `hsl(${hash % 360} 70% 61%)`, parameter: choice.parameter };
  });
}

/** Prefix counts make note indicators constant-time without per-note render effects. */
export function trackerFxPresencePrefix(rows: TrackerPatternEvent[][], channel: number): number[] {
  const counts = [0];
  for (const row of rows) {
    const event = row[channel];
    counts.push(counts[counts.length - 1] + (event && event.effect >= 0 && (event.effect > 0 || event.parameter > 0) ? 1 : 0));
  }
  return counts;
}
