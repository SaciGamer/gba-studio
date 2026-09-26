export function toLocalAssetUrl(filePath: string | null | undefined): string {
  if (!filePath) return '';
  if (
    filePath.startsWith('local://') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://') ||
    filePath.startsWith('/assets/')
  ) {
    return filePath;
  }

  return `local://${encodeURIComponent(filePath.replace(/\//g, '\\'))}`;
}

export function joinLocalAssetPath(
  directoryPath: string | null | undefined,
  filename: string | null | undefined,
): string {
  if (!directoryPath || !filename) return '';

  return toLocalAssetUrl(`${directoryPath.replace(/[\\/]+$/, '')}\\${filename}`);
}
