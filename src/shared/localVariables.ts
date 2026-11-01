/** Fixed engine slot references, like script parameter slots; not authored resource IDs. */
export const LOCAL_VARIABLE_COUNT = 8;
export const LOCAL_VARIABLES = Array.from({ length: LOCAL_VARIABLE_COUNT }, (_, index) => {
  const letter = String.fromCharCode(65 + index);
  return { id: `__LOCAL__:${letter}`, name: `Local ${letter}`, symbol: `local_${letter}`, type: 'number' as const, scope: 'LOCAL' as const, initialValue: 0 };
});
export const isLocalVariable = (id: unknown): id is string => typeof id === 'string' && /^__LOCAL__:[A-H]$/.test(id);
export function hasLocalVariableOwner(context: any): boolean {
  const selected = context?.elementSelected;
  const owner = context?.settingUtils?.activeSceneObject;
  return selected?._resourceType === 'prefab' && ['actor', 'trigger'].includes(selected.type)
    || !!owner && owner.sceneId === selected?.id && ['actor', 'trigger'].includes(owner.type);
}
