/** Background editor shortcuts must not handle keys belonging to a modal. */
export function isModalOpen(): boolean {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')]
    .some(dialog => dialog.getClientRects().length > 0 && getComputedStyle(dialog).visibility !== 'hidden');
}
