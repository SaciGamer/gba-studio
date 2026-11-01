/** Scene-name search uses the same substring/case rules in both views. */
export function matchesSceneSearch(scene: { name?: string }, search: string = ''): boolean {
  return !search || Boolean(scene.name?.toLowerCase().includes(search.toLowerCase()));
}
export function sceneSearchAfterSelection(search: string | undefined, scene: { name?: string } | null | undefined): string {
  return scene && !matchesSceneSearch(scene, search) ? '' : search ?? '';
}
