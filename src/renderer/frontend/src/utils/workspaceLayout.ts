export const NAVIGATION_HEADER_HEIGHT = 40;
export const NAVIGATION_SECTIONS = ['scenes', 'prefabs', 'scripts', 'variables'] as const;
type Section = typeof NAVIGATION_SECTIONS[number];
export type LeftNavigationLayout = {
  sizes?: number[];
  sections?: Partial<Record<Section, boolean>>;
  expandedKeys?: Partial<Record<Section, Array<string | number>>>;
};
export type WorkspaceLayout = { main?: number[]; centerWorkspace?: number[]; leftNavigation?: LeftNavigationLayout };

const layouts = new Map<string, WorkspaceLayout>();
const requests = new Map<string, Promise<WorkspaceLayout>>();
export const workspaceLayoutKey = (path?: string | null) => encodeURIComponent((path || 'unsaved-project').replace(/\\/g, '/').toLowerCase());
export const cachedWorkspaceLayout = (path?: string | null) => layouts.get(workspaceLayoutKey(path));

/** Preload during Engine startup, then reuse synchronously on editor remounts. */
export function loadWorkspaceLayout(path?: string | null): Promise<WorkspaceLayout> {
  const key = workspaceLayoutKey(path);
  const cached = layouts.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = requests.get(key);
  if (pending) return pending;
  const request = Promise.resolve().then(() => window.electronAPI.loadLastPositionSplitters(key))
    .then((saved: WorkspaceLayout | number[] | null) => Array.isArray(saved) ? { main: saved } : saved ?? {})
    .catch(error => { console.error('Failed to load workspace layout:', error); return {}; })
    .then(saved => { layouts.set(key, saved); requests.delete(key); return saved; });
  requests.set(key, request);
  return request;
}

export function cacheLeftNavigation(path: string | null | undefined, leftNavigation: LeftNavigationLayout) {
  cacheWorkspaceLayout(path, { leftNavigation });
}

export function cacheWorkspaceLayout(path: string | null | undefined, patch: Partial<WorkspaceLayout>) {
  // Main/center splitters are application preferences; navigation is per project.
  const common = { ...(patch.main ? { main: patch.main } : {}), ...(patch.centerWorkspace ? { centerWorkspace: patch.centerWorkspace } : {}) };
  if (patch.main || patch.centerWorkspace) {
    layouts.forEach((layout, projectKey) => layouts.set(projectKey, { ...layout, ...common }));
  }
  const key = workspaceLayoutKey(path);
  layouts.set(key, { ...layouts.get(key), ...patch });
}

export function restoreLeftNavigation(saved?: LeftNavigationLayout, height = window.innerHeight) {
  const sections = Object.fromEntries(NAVIGATION_SECTIONS.map(section => [section, saved?.sections?.[section] !== false])) as Record<Section, boolean>;
  // Keep a usable section when restoring an older preference with all four closed.
  if (!Object.values(sections).some(Boolean)) sections.scenes = true;
  const expandedKeys = Object.fromEntries(NAVIGATION_SECTIONS.map(section => {
    const keys = saved?.expandedKeys?.[section];
    return [section, Array.isArray(keys) ? keys.filter(key => typeof key === 'string' || typeof key === 'number') : undefined];
  })) as Record<Section, Array<string | number> | undefined>;
  const weights = NAVIGATION_SECTIONS.map((_, index) => {
    const size = saved?.sizes?.length === 4 ? saved.sizes[index] : 1;
    return Number.isFinite(size) && size! > 0 ? size! : 1;
  });
  const openCount = Object.values(sections).filter(Boolean).length;
  const available = Math.max(openCount * (NAVIGATION_HEADER_HEIGHT + 1), height - (4 - openCount) * NAVIGATION_HEADER_HEIGHT);
  const sizes = NAVIGATION_SECTIONS.map(() => NAVIGATION_HEADER_HEIGHT);
  let remaining = available;
  let pending = NAVIGATION_SECTIONS.map((section, index) => sections[section] ? index : -1).filter(index => index >= 0);
  while (pending.length) {
    const total = pending.reduce((sum, index) => sum + weights[index], 0);
    const small = pending.filter(index => remaining * weights[index] / total < NAVIGATION_HEADER_HEIGHT + 1);
    if (!small.length) {
      pending.forEach(index => { sizes[index] = remaining * weights[index] / total; });
      break;
    }
    small.forEach(index => { sizes[index] = NAVIGATION_HEADER_HEIGHT + 1; remaining -= sizes[index]; });
    pending = pending.filter(index => !small.includes(index));
  }
  return { sections, expandedKeys, sizes };
}
