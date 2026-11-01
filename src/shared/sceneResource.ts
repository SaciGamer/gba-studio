/** Remove the obsolete single-background slot; layer and event UUIDs are untouched. */
export function normalizeSceneResource<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, any>;
  if (source._resourceType !== 'scene' && !Array.isArray(source.backgrounds)) return value;
  const hasField = Object.prototype.hasOwnProperty.call(source, 'backgroundId');
  const hasWarning = source.__referenceWarnings && Object.prototype.hasOwnProperty.call(source.__referenceWarnings, 'backgroundId');
  if (!hasField && !hasWarning) return value;
  const next = { ...source };
  delete next.backgroundId;
  if (hasWarning) {
    const warnings = { ...source.__referenceWarnings };
    delete warnings.backgroundId;
    if (Object.keys(warnings).length) next.__referenceWarnings = warnings;
    else delete next.__referenceWarnings;
  }
  return next as T;
}
