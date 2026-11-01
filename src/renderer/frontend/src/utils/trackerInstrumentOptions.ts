import { trackerChannelAllowsInstrument, type TrackerChannelSettings, type TrackerInstrumentCategory } from './trackerChannelSettings';

/** Count within the displayed category while preserving the actual tracker ID. */
export function trackerInstrumentHierarchyNumber(id: number, categories: Record<string, 'Duty' | 'Wave' | 'Noise'>): number {
  const category = categories[String(id)] ?? 'Other';
  let number = 0;
  for (let previous = 1; previous <= id; previous += 1) {
    if ((categories[String(previous)] ?? 'Other') === category) number += 1;
  }
  return number;
}

export function trackerInstrumentHierarchyColor(id: number, categories: Record<string, 'Duty' | 'Wave' | 'Noise'>,
  channelType: string | undefined, configs: Record<string, Record<string, { color: string } | string>>, presetColors: Record<string, string>): string {
  const key = String(id);
  const category = categories[key] ?? channelType ?? 'Duty';
  const configured = configs[category]?.[key];
  return (typeof configured === 'string' ? configured : configured?.color) ?? presetColors[key] ?? ['#68c9b4', '#74a9ff', '#d995ff', '#ffbd68', '#fb8295', '#a9d275'][(id - 1) % 6];
}

/** Group labels use local numbering; option values retain the real tracker instrument IDs. */
export function trackerInstrumentOptions(names: Record<string, string>, categories: Record<string, 'Duty' | 'Wave' | 'Noise'>,
  settings: TrackerChannelSettings, channel: number, t: (key: string, values?: Record<string, string | number>) => string) {
  const ids = Object.keys(names).map(Number).filter(id => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
  return (['Duty', 'Wave', 'Noise', 'Other'] as TrackerInstrumentCategory[]).map(category => ({
    label: category === 'Other' ? t('music.instruments.other') : category,
    options: ids.filter(id => (categories[String(id)] ?? 'Other') === category).map((id, index) => ({
      value: id,
      label: `${String(index + 1).padStart(2, '0')} - ${names[String(id)] || t('music.instruments.instrumentNumber', { number: index + 1 })}`,
      disabled: !trackerChannelAllowsInstrument(settings, channel, category),
    })),
  })).filter(group => group.options.length > 0);
}
