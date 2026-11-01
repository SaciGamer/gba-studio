export type PreviewFontId = 'fixed8x8' | 'fixed8x16' | 'variable8x8' | 'variable8x16' | 'variable16x16';

const variable8x8Widths = [
  6,3,6,7,8,8,8,3,4,4,6,7,3,7,3,8,7,7,7,7,7,7,7,7,7,7,3,3,7,7,7,7,8,
  7,7,7,7,7,7,7,7,7,7,7,8,7,7,7,8,7,7,7,7,7,8,8,7,7,4,8,4,7,7,3,5,
  5,5,5,5,5,5,5,5,5,5,5,6,5,5,5,5,5,5,5,5,6,5,6,5,5,5,3,5,7,7,
  7,6,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
];

const variable8x16Widths = [
  6,4,7,8,8,7,8,4,5,5,7,7,4,7,4,7,7,4,7,7,7,7,7,7,7,7,4,4,6,7,6,7,8,
  7,7,7,7,7,7,7,7,7,5,7,7,7,8,7,7,7,8,7,7,7,7,7,8,7,7,7,5,7,5,4,7,4,
  7,7,7,7,7,6,7,7,3,4,6,3,8,7,7,7,7,6,7,6,7,7,8,7,7,7,6,3,6,8,7,7,
  7,7,5,7,7,7,7,7,7,7,7,7,7,7,7,7,
];

const accentWidths8x8 = [7,6,7,7,7,7,7,5,5,5,5,6,6,5,3,7];
const accentWidths8x16 = [7,7,5,7,7,7,7,7,7,4,7,7,7,7,3,7];

export const PREVIEW_FONTS: Record<PreviewFontId, { glyphWidth: number; glyphHeight: number; variable: boolean; image: string; widths?: number[]; accentWidths?: number[] }> = {
  fixed8x8: { glyphWidth: 8, glyphHeight: 8, variable: false, image: 'common_fixed_8x8_font.bmp' },
  fixed8x16: { glyphWidth: 8, glyphHeight: 16, variable: false, image: 'common_fixed_8x16_font.bmp' },
  variable8x8: { glyphWidth: 8, glyphHeight: 8, variable: true, image: 'common_variable_8x8_font.bmp', widths: variable8x8Widths, accentWidths: accentWidths8x8 },
  variable8x16: { glyphWidth: 8, glyphHeight: 16, variable: true, image: 'common_variable_8x16_font.bmp', widths: variable8x16Widths, accentWidths: accentWidths8x16 },
  variable16x16: { glyphWidth: 16, glyphHeight: 16, variable: true, image: 'common_variable_16x16_font.bmp', widths: variable8x16Widths.map(width => width * 2), accentWidths: accentWidths8x16.map(width => width * 2) },
};

export const FONT_ACCENTS = ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü', 'Ñ', 'á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¡', '¿'];

export function fontGlyphIndex(character: string): number {
  const code = character.charCodeAt(0);
  if (code >= 33 && code <= 126) return code - 33;
  const accentIndex = FONT_ACCENTS.indexOf(character);
  return accentIndex >= 0 ? 94 + accentIndex : -1;
}

export function fontCharacterWidth(font: PreviewFontId, character: string): number {
  const metrics = PREVIEW_FONTS[font];
  const code = character.charCodeAt(0);
  if (!metrics.variable) return metrics.glyphWidth;
  if (code >= 32 && code <= 126) return metrics.widths?.[code - 32] ?? metrics.glyphWidth;
  const accentIndex = FONT_ACCENTS.indexOf(character);
  return accentIndex >= 0 ? metrics.accentWidths?.[accentIndex] ?? metrics.glyphWidth : metrics.glyphWidth;
}

export function measureFontText(font: PreviewFontId, value: string): { width: number; height: number } {
  const lines = String(value).split('\n');
  const width = Math.max(0, ...lines.map(line => Array.from(line).reduce((sum, character) => sum + fontCharacterWidth(font, character), 0)));
  return { width, height: Math.max(1, lines.length) * PREVIEW_FONTS[font].glyphHeight };
}
