import { MAX_RECEIPTS_PER_PURCHASE, SPEND_WORDS } from '@apps/runway/constants';

/** Which of the chosen files a purchase can take on top of `heldCount` it already has, and the one sentence for what was left out (null when all fit). */
export function pickReceiptFiles(files: readonly File[], heldCount: number) {
  const images = files.filter((file) => file.type.startsWith('image/'));
  const room = Math.max(0, MAX_RECEIPTS_PER_PURCHASE - heldCount);
  const taken = images.slice(0, room);
  const note =
    images.length < files.length
      ? SPEND_WORDS.receiptNotImage
      : taken.length < images.length
        ? SPEND_WORDS.receiptLimit(MAX_RECEIPTS_PER_PURCHASE)
        : null;
  return { files: taken, note };
}

/** The nearest ancestor that scrolls, which is where a sheet's body keeps its position. */
export function findScrollParent(node: HTMLElement | null) {
  const isScrolling = (element: HTMLElement) =>
    /auto|scroll/.test(getComputedStyle(element).overflowY);
  const climb = (element: HTMLElement | null): HTMLElement | null =>
    element === null || isScrolling(element)
      ? element
      : climb(element.parentElement);
  return climb(node?.parentElement ?? null);
}
