/** Project state uses immutable updates. Copy each new branch once and share
 * unchanged branches between history entries, without serializing the project.
 * Save acknowledgements do not create edits; restored resources are dirty.
 */
export function createHistorySnapshotCache() {
  const copies = new WeakMap<object, unknown>();

  const capture = <T,>(value: T, previous?: T): T => {
    if (!value || typeof value !== 'object') return value;
    if (copies.has(value)) return copies.get(value) as T;
    const array = Array.isArray(value);
    const prior = previous && typeof previous === 'object' && Array.isArray(previous) === array
      ? previous as Record<string, unknown> : undefined;
    const result: any = array ? [] : {};
    const entries = Object.entries(value);
    let unchanged = !!prior && Object.keys(prior).length === entries.length;
    for (const [key, item] of entries) {
      const captured = key === '_saved' ? false : capture(item, prior?.[key]);
      result[key] = captured;
      unchanged = unchanged && Object.prototype.hasOwnProperty.call(prior, key) && Object.is(captured, prior?.[key]);
    }
    const snapshot = unchanged ? previous! : result as T;
    copies.set(value, snapshot);
    copies.set(snapshot as object, snapshot);
    return snapshot;
  };

  const restore = <T,>(target: T, current: T): T => {
    if (Object.is(capture(current), target)) return current;
    if (!target || typeof target !== 'object') return target;
    const result: any = Array.isArray(target) ? [] : {};
    // Match resource lists by ID so insertion/deletion preserves other resources.
    const byId = Array.isArray(current)
      ? new Map(current.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]))
      : undefined;
    for (const [key, item] of Object.entries(target)) {
      const existing = byId && item && typeof item === 'object' && 'id' in item
        ? byId.get(item.id) : (current as any)?.[key];
      result[key] = restore(item, existing);
    }
    copies.set(result, target);
    return result as T;
  };

  let previous: unknown;
  return {
    capture<T>(value: T): T {
      const result = capture(value, previous as T);
      previous = result;
      return result;
    },
    restore,
  };
}
