/** Deleted entries stay in editor history; persistence omits them. */
export function isActiveProjectEntry(entry: { _deleted?: boolean }): boolean {
  return !entry._deleted;
}

export function pruneDeletedProjectEntries<T>(resource: T): T {
  if (!resource || typeof resource !== 'object') return resource;
  const value = resource as Record<string, any>;
  const key = value._resourceType === 'variables' ? 'variables' : value._resourceType === 'scripts' ? 'scripts' : null;
  if (!key || !Array.isArray(value[key]) || !value[key].some((entry: any) => entry?._deleted)) return resource;
  return { ...value, [key]: value[key].filter((entry: any) => !entry?._deleted) } as T;
}

export function hasDeletedProjectEntries(resource: unknown): boolean {
  return pruneDeletedProjectEntries(resource) !== resource;
}
