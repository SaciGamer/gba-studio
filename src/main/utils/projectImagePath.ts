import path from 'path';

/** Resolve preview images only within the open project's source or working assets. */
export function resolveProjectImagePath(source: string, projectRoots: Array<string | null | undefined>): string {
  const roots = projectRoots.filter((root): root is string => Boolean(root));
  if (!roots.length) throw new Error('Project directory is unavailable.');
  const decoded = source.startsWith('local://')
    ? decodeURIComponent(source.slice('local://'.length))
    : source;
  const normalized = /^[a-zA-Z](\\|\/)/.test(decoded)
    ? decoded.replace(/^([a-zA-Z])(\\|\/)/, '$1:\\')
    : decoded;
  const imagePath = path.resolve(normalized);
  const allowed = roots.some(root => {
    const relative = path.relative(path.resolve(root, 'assets'), imagePath);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (!allowed) throw new Error('Image source is outside project assets.');
  return imagePath;
}
