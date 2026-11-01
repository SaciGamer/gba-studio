/** Basename accepted by tracker project paths and generated music assets. */
export function sanitizeMusicAssetName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_').slice(0, 120);
}
