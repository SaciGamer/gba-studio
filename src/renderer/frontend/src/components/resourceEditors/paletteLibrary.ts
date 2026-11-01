import { DEFAULT_PALETTES as defaultPalettes } from '../../../../../shared/defaultPalettes';
import { IPaletteDefinition } from '@/providers/contexts/interfaces/ISettingElement';

export type PaletteDefinition = IPaletteDefinition;

/** Only palettes assigned to the 16 default hardware slots can be selected for use. */
export function getConfiguredPalettes(palettes: PaletteDefinition[], colorPaletteIds: unknown): PaletteDefinition[] {
  const ids = new Set(Array.isArray(colorPaletteIds) ? colorPaletteIds.slice(0, 16) : []);
  return palettes.filter(palette => ids.has(palette.id));
}

/** Slot references stay distinct when the same palette is assigned more than once. */
export function getPaletteSlotOptions(palettes: PaletteDefinition[], colorPaletteIds: unknown): PaletteDefinition[] {
  return (Array.isArray(colorPaletteIds) ? colorPaletteIds.slice(0, 16) : []).flatMap((id, slot) => {
    const palette = palettes.find(item => item.id === id);
    return palette ? [{ ...palette, id: `__slot__:${slot}`, name: `${slot}: ${palette.name}` }] : [];
  });
}

export function getPreviewPalettes(palettes: PaletteDefinition[], colorPaletteIds: unknown): PaletteDefinition[] {
  return [...palettes, ...getPaletteSlotOptions(palettes, colorPaletteIds)];
}

export const PALETTE_STORAGE_KEY = 'gba-studio-palettes';
export const LEGACY_CUSTOM_PALETTE_STORAGE_KEY = 'gba-studio-custom-palettes';

export { DEFAULT_PALETTES as defaultPalettes } from '../../../../../shared/defaultPalettes';

export function normalizePalette(value: Partial<PaletteDefinition>): PaletteDefinition | null {
  if (!value.id || !value.name || !Array.isArray(value.colors)) return null;
  const colors = value.colors.slice(0, 16).map(color => typeof color === 'string' ? color : '#000000');
  while (colors.length < 16) colors.push('#000000');
  return {
    id: value.id,
    name: value.name,
    custom: value.custom === true,
    colors,
    ...(typeof value.createdAt === 'number' ? { createdAt: value.createdAt } : {}),
  };
}

/** Keeps legacy palettes in their existing order and places timestamped palettes by creation time. */
export function sortPalettesByCreation(palettes: PaletteDefinition[]): PaletteDefinition[] {
  return palettes
    .map((palette, index) => ({ palette, index }))
    .sort((left, right) => {
      if (typeof left.palette.createdAt !== 'number' || typeof right.palette.createdAt !== 'number') {
        return left.index - right.index;
      }
      return left.palette.createdAt - right.palette.createdAt || left.index - right.index;
    })
    .map(({ palette }) => palette);
}

export function loadPaletteLibrary(): PaletteDefinition[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY) ?? 'null');
    if (Array.isArray(stored)) {
      const palettes = stored.map(normalizePalette).filter((palette): palette is PaletteDefinition => Boolean(palette));
      if (palettes.length) {
        const existing = new Set(palettes.map(palette => palette.id));
        return [...palettes, ...defaultPalettes.filter(palette => !existing.has(palette.id)).map(palette => normalizePalette(palette) as PaletteDefinition)];
      }
    }

    const legacy = JSON.parse(localStorage.getItem(LEGACY_CUSTOM_PALETTE_STORAGE_KEY) ?? '[]');
    const custom = Array.isArray(legacy)
      ? legacy.map(normalizePalette).filter((palette): palette is PaletteDefinition => Boolean(palette))
      : [];
    return [
      ...defaultPalettes.map(palette => normalizePalette(palette) as PaletteDefinition),
      ...custom,
    ];
  } catch (error) {
    console.error('Failed to load palette library:', error);
    return defaultPalettes.map(palette => normalizePalette(palette) as PaletteDefinition);
  }
}

export function getDefaultPalette(id: string) {
  const palette = defaultPalettes.find(item => item.id === id);
  return palette ? normalizePalette(palette) : null;
}
