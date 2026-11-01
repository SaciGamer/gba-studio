/** Group names are authored on Play Sound events, including nested and graph scripts. */
export function collectSoundGroups(...resources: unknown[]): string[] {
  const names = new Set<string>();
  const visited = new Set<object>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const source = value as Record<string, any>;
    if (source._deleted) return;
    const group = source.args?.group;
    if (source.command === 'EVENT_PLAY_SOUND' && typeof group === 'string' && group.trim()) names.add(group);
    Object.values(source).forEach(walk);
  };
  resources.forEach(walk);
  return [...names].sort((a, b) => a.localeCompare(b));
}
