/** Project UUIDs keep a new beat from inheriting a deleted/recreated path's mixer. */
export const trackerMixerStorageKey = (url: string, projectId?: string) =>
  `gba-studio-tracker-mixer:${projectId ? `project:${projectId}` : url}`;
