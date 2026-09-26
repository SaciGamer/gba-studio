import { IPaletteDefinition } from '@/providers/contexts/interfaces/ISettingElement';

export type PaletteDefinition = IPaletteDefinition;

export const PALETTE_STORAGE_KEY = 'gba-studio-palettes';
export const LEGACY_CUSTOM_PALETTE_STORAGE_KEY = 'gba-studio-custom-palettes';

export const defaultPalettes: PaletteDefinition[] = [
  { id: 'preset-gba', name: 'GBA Classic', colors: ['#000000', '#ffffff', '#b5d8a8', '#73a55c', '#3d6b3d', '#203c56', '#456b8c', '#8fb8d8', '#f4d35e', '#ee964b', '#f95738', '#9e2a2b', '#6a4c93', '#8e7dbe', '#2a9d8f', '#264653'] },
  { id: 'preset-gameboy', name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#1b1b1b', '#3b4a2f', '#5f7c3b', '#cadc9f', '#283618', '#606c38', '#a3b18a', '#dad7cd', '#344e41', '#588157', '#a3b18a', '#fefae0'] },
  { id: 'preset-grayscale', name: 'Grayscale', colors: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee', '#ffffff'] },
  { id: 'preset-sunset', name: 'Sunset', colors: ['#16001e', '#301934', '#512b58', '#7b2d5f', '#a44255', '#d05a4e', '#ef8354', '#f6bd60', '#f7ede2', '#84a59d', '#52796f', '#354f52', '#2f3e46', '#e07a5f', '#3d405b', '#81b29a'] },
  { id: 'preset-nintendo', name: 'Nintendo', colors: ['#000000', '#ffffff', '#d82800', '#f87858', '#0058f8', '#6888fc', '#007800', '#58d854', '#f8b800', '#f8d878', '#a80020', '#b8b8b8', '#686868', '#4000a8', '#d8b8f8', '#983800'] },
  { id: 'preset-gamecube', name: 'GameCube', colors: ['#101820', '#ffffff', '#4b2e83', '#8064a2', '#2e75b6', '#6fa8dc', '#38761d', '#93c47d', '#bf9000', '#ffd966', '#cc0000', '#e06666', '#134f5c', '#76a5af', '#351c75', '#b4a7d6'] },
  { id: 'preset-master-system', name: 'Master System', colors: ['#000000', '#ffffff', '#d8d8d8', '#888888', '#d82820', '#f87858', '#2050d8', '#5890f8', '#208820', '#58c858', '#d8a020', '#f8d858', '#782878', '#b858b8', '#205858', '#58a8a8'] },
  { id: 'preset-dreamcast', name: 'Dreamcast', colors: ['#101010', '#f0f0f0', '#1f4e79', '#5b9bd5', '#70ad47', '#a9d18e', '#c55a11', '#ed7d31', '#7030a0', '#a64d79', '#bf0000', '#ff6666', '#00a6a6', '#66cccc', '#806000', '#d6b656'] },
];

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
