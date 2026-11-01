export interface RuntimeSnapshot {
  frame: number; iwramStatic: number; stack: number; stackPeak: number; iwramMinFree: number;
  iwramFree: number;
  ewramStatic: number; heapUsed: number; heapFree: number; heapMinFree: number;
  spritesUsed: number; spritesFree: number; spriteTilesUsed: number; spriteTilesFree: number;
  bgBlocksUsed: number; bgBlocksFree: number; spritesPeak: number; spriteTilesPeak: number; bgBlocksPeak: number;
  backgroundMode?: 'regular-bg' | 'direct-bitmap';
  cpuAveragePercent?: number; cpuPeakPercent?: number;
}
export type ResourceLevel = 'normal' | 'warning' | 'critical';
export function parseRuntimeSnapshot(message: unknown): RuntimeSnapshot | null {
  if (typeof message !== 'string') return null;
  const match = message.match(/\[GBAS_MONITOR:(1)\]\s*([0-9,-]+)(?:;|\s|$)/);
  const payload = match?.[2];
  if (!payload) return null;
  const fields = payload.split(',');
  if (fields.some(field => !/^-?\d+$/.test(field))) return null;
  const values = fields.map(Number);
  if ((values.length !== 20 && values.length !== 22) || values.some(value => !Number.isSafeInteger(value))) return null;
  if (values.some((value, index) => value < 0 && index !== 4 && index !== 19) || values[1] > 32768 || values[5] > 262144 || values[4] > 32768 || values[7] > 262144 || values[8] > 262144 || values[18] > 1 || values[19] > 32768 || (values.length === 22 && (values[20] > 100000 || values[21] > 100000))) return null;
  const [frame, iwramStatic, stack, stackPeak, iwramMinFree, ewramStatic, heapUsed, heapFree, heapMinFree, spritesUsed, spritesFree, spriteTilesUsed, spriteTilesFree, bgBlocksUsed, bgBlocksFree, spritesPeak, spriteTilesPeak, bgBlocksPeak] = values;
  return { frame, iwramStatic, stack, stackPeak, iwramMinFree, iwramFree: values[19], ewramStatic, heapUsed, heapFree, heapMinFree, spritesUsed, spritesFree, spriteTilesUsed, spriteTilesFree, bgBlocksUsed, bgBlocksFree, spritesPeak, spriteTilesPeak, bgBlocksPeak, backgroundMode: values[18] === 1 ? 'direct-bitmap' : 'regular-bg', ...(values.length === 22 ? { cpuAveragePercent: values[20] / 10, cpuPeakPercent: values[21] / 10 } : {}) };
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
