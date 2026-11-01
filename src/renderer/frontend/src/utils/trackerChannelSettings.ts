export type TrackerInstrumentCategory = 'Duty' | 'Wave' | 'Noise' | 'Other';
export type TrackerChannelSettings = Record<string, { name?: string; instrumentType?: TrackerInstrumentCategory | 'Any'; hidden?: boolean }>;

export function trackerChannelAllowsInstrument(settings: TrackerChannelSettings, channel: number, category: TrackerInstrumentCategory): boolean {
  const allowed = settings[String(channel)]?.instrumentType;
  return !allowed || allowed === 'Any' || allowed === category;
}
