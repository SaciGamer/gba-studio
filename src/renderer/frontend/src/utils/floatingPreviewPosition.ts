/** Keep floating editor previews below the actual toolbar, including UI scaling. */
export function floatingPreviewTop(anchorTop: number, height: number): number {
  const toolbar = document.querySelector('[data-preview-topbar]');
  const minimum = Math.max(8, (toolbar?.getBoundingClientRect().bottom ?? 0) + 8);
  return Math.max(minimum, Math.min(anchorTop, window.innerHeight - height - 8));
}
