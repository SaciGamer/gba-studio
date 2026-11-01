export const MENU_MAX_OPTIONS = 32;
export const MENU_OPTION_MAX_BYTES = 63;
export const MENU_LINE_HEIGHT = 16;
export const MENU_TEXT_WIDTH = 224;
export const MENU_MAX_PROMPT_ROWS = 2;
export const MENU_MAX_PROMPT_CHARACTERS = 56;
export type MenuPosition = 'dialogue' | 'full-screen' | 'left' | 'right';

export function menuPromptLines(prompt: string, width = MENU_TEXT_WIDTH): string[] {
  if (!prompt) return [];
  const capacity = Math.max(1, Math.floor(width / 8));
  const lines: string[] = [];
  let line = '';
  for (const char of prompt.replace(/\r/g, '')) {
    if (char === '\n') { lines.push(line); line = ''; continue; }
    if (Array.from(line).length >= capacity) { lines.push(line); line = ''; }
    line += char;
  }
  if (line || prompt.endsWith('\n')) lines.push(line);
  return lines;
}

export function getMenuLayout(args: Record<string, any>, supportsColumns = true) {
  const position: MenuPosition = supportsColumns && ['full-screen', 'left', 'right'].includes(args.position) ? args.position : 'dialogue';
  const columns = supportsColumns ? Math.max(1, Math.min(position === 'left' || position === 'right' ? 2 : 4, Math.trunc(Number(args.columns) || 1))) : 1;
  const columnMajor = supportsColumns && columns > 1 && args.optionOrder === 'columns';
  const areaWidth = position === 'left' || position === 'right' ? columns * 60 : MENU_TEXT_WIDTH;
  const promptWidth = position === 'left' || position === 'right' ? areaWidth - 16 : areaWidth;
  const options: string[] = Array.isArray(args.options) && args.options.length
    ? args.options.filter((option: unknown): option is string => typeof option === 'string')
    : [args.optionA, args.optionB].filter((option): option is string => typeof option === 'string' && !!option);
  const prompt = args.showTitle === false ? '' : String(args.prompt ?? '');
  const promptLines = menuPromptLines(prompt, promptWidth);
  const promptRows = Math.min(MENU_MAX_PROMPT_ROWS, promptLines.length);
  const cellWidth = Math.floor((promptWidth - (columns - 1) * 8) / columns);
  const optionWidth = Math.max(0, cellWidth - 16);
  const rows = position === 'dialogue' ? 3 - promptRows : 9 - promptRows;
  const capacity = columns * rows;
  return { columns, columnMajor, position, areaWidth, promptWidth, options, prompt, promptLines, promptRows, rows, cellWidth, optionWidth, optionCharacters: Math.floor(optionWidth / 8), capacity, pages: Math.max(1, Math.ceil(options.length / capacity)) };
}

export function menuOptionCell(index: number, layout: ReturnType<typeof getMenuLayout>) {
  const page = Math.floor(index / layout.capacity), local = index % layout.capacity;
  const row = layout.columnMajor ? local % layout.rows : Math.floor(local / layout.columns);
  const column = layout.columnMajor ? Math.floor(local / layout.rows) : local % layout.columns;
  const left = layout.position === 'right' ? 240 - layout.areaWidth + 8 : 8;
  const baseY = layout.position === 'dialogue' ? layout.promptRows * 16 : 8 + layout.promptRows * 16;
  return { page, row, column, x: left + column * (layout.cellWidth + 8), y: baseY + row * 16 };
}

export function moveMenuSelection(index: number, count: number, columns: number, rows: number, columnMajor: boolean, dx: number, dy: number): number {
  if (count <= 1) return 0;
  if (columnMajor ? dy !== 0 : dx !== 0) return (index + (columnMajor ? dy : dx) + count) % count;
  const stride = columnMajor ? rows : columns, fixed = index % stride, cells = Math.ceil(count / stride);
  let moving = Math.floor(index / stride);
  for (let attempt = 0; attempt < cells; attempt++) {
    moving = (moving + (columnMajor ? dx : dy) + cells) % cells;
    const candidate = moving * stride + fixed;
    if (candidate < count) return candidate;
  }
  return index;
}

export function getMenuLayoutIssues(args: Record<string, any>, supportsColumns = true): Array<{ code: string; index?: number; max?: number }> {
  const layout = getMenuLayout(args, supportsColumns), issues: Array<{ code: string; index?: number; max?: number }> = [];
  if (layout.options.length > MENU_MAX_OPTIONS) issues.push({ code: 'optionCount', max: MENU_MAX_OPTIONS });
  if (!layout.options.length || layout.options.some(option => !option.trim()) || (Array.isArray(args.options) && args.options.some((option: unknown) => typeof option !== 'string'))) issues.push({ code: 'emptyOptions' });
  if (layout.promptLines.length > MENU_MAX_PROMPT_ROWS) issues.push({ code: 'promptRows', max: MENU_MAX_PROMPT_ROWS });
  layout.options.forEach((option, index) => {
    if (/[\r\n\t]/.test(option) || Array.from(option).length * 8 > layout.optionWidth) issues.push({ code: 'optionWidth', index: index + 1, max: layout.optionCharacters });
    if (new TextEncoder().encode(option).length > MENU_OPTION_MAX_BYTES) issues.push({ code: 'optionBytes', index: index + 1, max: MENU_OPTION_MAX_BYTES });
  });
  return issues;
}
