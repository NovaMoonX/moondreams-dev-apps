const REVEAL_FRAMES = 40;

let pendingId: string | null = null;

/** Whether a row is waiting to be scrolled into view, so a tab's own scroll restore stands aside for it. */
export const isRevealPending = () => pendingId !== null;

const findRow = (itemId: string) =>
  document.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`) ??
  document.querySelector(`[data-item-ids~="${CSS.escape(itemId)}"]`);

/** Scrolls an item's row to the middle of the screen once it is drawn (a tab that is still mounting, a chunk not yet mounted), giving up after a short wait. */
export function revealItem(itemId: string) {
  pendingId = itemId;
  const stop = () => {
    if (pendingId === itemId) pendingId = null;
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  const attempt = (frame: number) => {
    if (pendingId !== itemId) {
      stop();
      return;
    }
    const row = findRow(itemId);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      if (frame >= REVEAL_FRAMES / 2) pendingId = null;
    }
    if (frame >= REVEAL_FRAMES) {
      stop();
      return;
    }
    requestAnimationFrame(() => attempt(frame + 1));
  };
  requestAnimationFrame(() => attempt(0));
}
