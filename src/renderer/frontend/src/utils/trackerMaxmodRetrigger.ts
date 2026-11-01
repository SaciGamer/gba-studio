/** Number of Qxy retriggers Maxmod executes before a row's tick count ends. */
export const trackerMaxmodRowRetriggerCount = (interval: number, tickCount: number): number => {
  const ticks = Math.max(0, Math.trunc(tickCount));
  const step = Math.trunc(interval);
  if (step <= 0 || ticks <= 1) return 0;
  return Math.floor((ticks - 1) / step);
};
