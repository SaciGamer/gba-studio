export type TrackerItInstrumentEvent = {
  note: number;
  notePresent?: boolean;
  instrument: number;
  instrumentPresent?: boolean;
};

export function trackerItInstrumentMemoryAfterEvent(event: TrackerItInstrumentEvent, currentInstrument: number): number {
  if (event.instrumentPresent) return Math.max(0, Math.trunc(event.instrument));
  return event.instrument > 0 ? Math.trunc(event.instrument) : currentInstrument;
}

export function trackerItEventTriggersNote(event: TrackerItInstrumentEvent, currentInstrument: number): boolean {
  const hasNote = event.notePresent ?? event.instrument > 0;
  return hasNote
    && event.note >= 0
    && event.note <= 119
    && currentInstrument > 0;
}
