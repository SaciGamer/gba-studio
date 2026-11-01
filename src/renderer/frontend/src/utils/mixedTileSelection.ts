import type { IBackgroundElement } from '@/providers/contexts/interfaces/ISceneElement';

export type TileCell = { col: number; row: number };
type Override = NonNullable<IBackgroundElement['tileMapCellOverrides']>[number];
export type TileSelectionData = {
  map: number[][]; tilesetIds: Array<Array<string | null>>; paletteIds: Array<Array<string | null>>;
  autoTileMap: number[][]; overrides: Override[];
};
type AutoUnit = TileCell & { slot: number; factor: number };
export type MixedTileClipboard = {
  grid: number; width: number; height: number; alignment: number; phase: TileCell;
  cells: Array<TileCell & { tile: number; tilesetId: string | null; paletteId: string | null; override?: Omit<Override, 'index'> }>;
  autoUnits: AutoUnit[];
};
type Factor = (slot: number) => number;
const cellKey = ({ col, row }: TileCell) => `${col}:${row}`;

function unitAt(data: TileSelectionData, cell: TileCell, factorFor: Factor): AutoUnit | undefined {
  for (const factor of [4, 2, 1]) {
    const col = Math.floor(cell.col / factor) * factor, row = Math.floor(cell.row / factor) * factor;
    const slot = data.autoTileMap[row]?.[col] ?? -1;
    if (slot >= 0 && factorFor(slot) === factor) return { col, row, slot, factor };
  }
}
export function expandMixedTileSelection(data: TileSelectionData, cells: TileCell[], factorFor: Factor): TileCell[] {
  const result = new Map(cells.map(cell => [cellKey(cell), cell]));
  for (const cell of cells) {
    const unit = unitAt(data, cell, factorFor);
    if (!unit) continue;
    for (let dy = 0; dy < unit.factor; ++dy) for (let dx = 0; dx < unit.factor; ++dx) {
      const target = { col: unit.col + dx, row: unit.row + dy };
      if ((data.map[target.row]?.[target.col] ?? -1) >= 0) result.set(cellKey(target), target);
    }
  }
  return [...result.values()];
}
export function copyMixedTileSelection(data: TileSelectionData, cells: TileCell[], grid: number, factorFor: Factor): MixedTileClipboard {
  cells = expandMixedTileSelection(data, cells, factorFor);
  const minCol = Math.min(...cells.map(cell => cell.col)), minRow = Math.min(...cells.map(cell => cell.row));
  const columns = data.map[0]?.length ?? 0;
  const overrides = new Map(data.overrides.map(item => [item.index, item]));
  const units = new Map<string, AutoUnit>();
  for (const cell of cells) {
    const unit = unitAt(data, cell, factorFor);
    if (unit) units.set(cellKey(unit), unit);
  }
  const alignment = Math.max(1, ...[...units.values()].map(unit => unit.factor));
  return {
    grid, width: Math.max(...cells.map(cell => cell.col)) - minCol + 1, height: Math.max(...cells.map(cell => cell.row)) - minRow + 1,
    alignment, phase: { col: minCol % alignment, row: minRow % alignment },
    autoUnits: [...units.values()].map(unit => ({ ...unit, col: unit.col - minCol, row: unit.row - minRow })),
    cells: cells.flatMap(cell => {
      const tile = data.map[cell.row]?.[cell.col] ?? -1;
      if (tile < 0) return [];
      const override = overrides.get(cell.row * columns + cell.col);
      return [{ col: cell.col - minCol, row: cell.row - minRow, tile,
        tilesetId: data.tilesetIds[cell.row]?.[cell.col] ?? null, paletteId: data.paletteIds[cell.row]?.[cell.col] ?? null,
        ...(override ? { override: { tileIndex: override.tileIndex, horizontalFlip: override.horizontalFlip, verticalFlip: override.verticalFlip, paletteId: override.paletteId } } : {}) }];
    }),
  };
}
function clone(data: TileSelectionData): TileSelectionData {
  return { map: data.map.map(row => [...row]), tilesetIds: data.tilesetIds.map(row => [...row]),
    paletteIds: data.paletteIds.map(row => [...row]), autoTileMap: data.autoTileMap.map(row => [...row]), overrides: data.overrides.map(item => ({ ...item })) };
}
export function clearMixedTileSelection(data: TileSelectionData, cells: TileCell[], factorFor: Factor): TileSelectionData {
  const next = clone(data), clearing = new Map(cells.map(cell => [cellKey(cell), cell]));
  for (const cell of cells) {
    const unit = unitAt(data, cell, factorFor);
    if (!unit) continue;
    next.autoTileMap[unit.row][unit.col] = -1;
    for (let dy = 0; dy < unit.factor; ++dy) for (let dx = 0; dx < unit.factor; ++dx) {
      const target = { col: unit.col + dx, row: unit.row + dy };
      if (data.tilesetIds[target.row]?.[target.col]?.startsWith('auto-tile:')) clearing.set(cellKey(target), target);
    }
  }
  const columns = next.map[0]?.length ?? 0, indices = new Set<number>();
  for (const cell of clearing.values()) {
    if (!next.map[cell.row] || cell.col < 0 || cell.col >= columns) continue;
    next.map[cell.row][cell.col] = -1; next.tilesetIds[cell.row][cell.col] = null; next.paletteIds[cell.row][cell.col] = null;
    indices.add(cell.row * columns + cell.col);
  }
  next.overrides = next.overrides.filter(item => !indices.has(item.index));
  return next;
}
export function mixedTilePasteOrigin(clipboard: MixedTileClipboard, requested: TileCell, columns: number, rows: number): TileCell | null {
  const aligned = (value: number, limit: number, phase: number) => {
    const low = Math.ceil(-phase / clipboard.alignment), high = Math.floor((limit - phase) / clipboard.alignment);
    return low > high ? null : phase + Math.max(low, Math.min(high, Math.round((value - phase) / clipboard.alignment))) * clipboard.alignment;
  };
  const col = aligned(requested.col, columns - clipboard.width, clipboard.phase.col);
  const row = aligned(requested.row, rows - clipboard.height, clipboard.phase.row);
  return col === null || row === null ? null : { col, row };
}
export function pasteMixedTileSelection(data: TileSelectionData, clipboard: MixedTileClipboard, origin: TileCell, factorFor: Factor): TileSelectionData {
  const targets = clipboard.cells.map(cell => ({ col: origin.col + cell.col, row: origin.row + cell.row }));
  const next = clearMixedTileSelection(data, targets, factorFor), columns = next.map[0]?.length ?? 0;
  const overrides = new Map(next.overrides.map(item => [item.index, item]));
  clipboard.cells.forEach((cell, position) => {
    const { col, row } = targets[position];
    if (row < 0 || row >= next.map.length || col < 0 || col >= columns) return;
    next.map[row][col] = cell.tile; next.tilesetIds[row][col] = cell.tilesetId; next.paletteIds[row][col] = cell.paletteId;
    if (cell.override) overrides.set(row * columns + col, { ...cell.override, index: row * columns + col });
  });
  for (const unit of clipboard.autoUnits) {
    const col = origin.col + unit.col, row = origin.row + unit.row;
    if (col < 0 || col >= columns || row < 0 || row >= next.map.length) continue;
    while (next.autoTileMap.length <= row) next.autoTileMap.push([]);
    while (next.autoTileMap[row].length <= col) next.autoTileMap[row].push(-1);
    next.autoTileMap[row][col] = unit.slot;
  }
  next.overrides = [...overrides.values()];
  return next;
}
