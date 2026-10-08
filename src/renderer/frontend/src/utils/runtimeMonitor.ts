export interface RuntimeSnapshot {
  frame: number; iwramStatic: number; stack: number; stackPeak: number; iwramMinFree: number;
  ewramStatic: number; heapUsed: number; heapFree: number; heapMinFree: number;
  spritesUsed: number; spritesFree: number; spriteTilesUsed: number; spriteTilesFree: number;
  bgBlocksUsed: number; bgBlocksFree: number; spritesPeak: number; spriteTilesPeak: number; bgBlocksPeak: number;
}
export type ResourceLevel = 'normal' | 'warning' | 'critical';
export function parseRuntimeSnapshot(message: unknown): RuntimeSnapshot | null {
  if (typeof message !== 'string') return null;
  const payload = message.match(/\[GBAS_MONITOR:1\]\s*([0-9,-]+)(?:;|\s|$)/)?.[1];
  if (!payload) return null;
  const fields = payload.split(',');
  if (fields.some(field => !/^-?\d+$/.test(field))) return null;
  const values = fields.map(Number);
  if (values.length !== 18 || values.some(value => !Number.isSafeInteger(value))) return null;
  if (values.some((value, index) => value < 0 && index !== 4) || values[1] > 32768 || values[5] > 262144 || values[4] > 32768 || values[7] > 262144 || values[8] > 262144) return null;
  const [frame, iwramStatic, stack, stackPeak, iwramMinFree, ewramStatic, heapUsed, heapFree, heapMinFree, spritesUsed, spritesFree, spriteTilesUsed, spriteTilesFree, bgBlocksUsed, bgBlocksFree, spritesPeak, spriteTilesPeak, bgBlocksPeak] = values;
  return { frame, iwramStatic, stack, stackPeak, iwramMinFree, ewramStatic, heapUsed, heapFree, heapMinFree, spritesUsed, spritesFree, spriteTilesUsed, spriteTilesFree, bgBlocksUsed, bgBlocksFree, spritesPeak, spriteTilesPeak, bgBlocksPeak };
}
export function memoryLevel(free: number, warningBytes: number): ResourceLevel {
  return free < warningBytes / 2 ? 'critical' : free < warningBytes ? 'warning' : 'normal';
}
export function resourceLevel(used: number, free: number): ResourceLevel {
  const capacity = used + free;
  if (capacity <= 0) return 'critical';
  const ratio = used / capacity;
  return ratio >= 0.9 ? 'critical' : ratio >= 0.8 ? 'warning' : 'normal';
}
