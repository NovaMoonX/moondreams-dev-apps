import { useEffect } from 'react';

const EDGE_GAP_PX = 16;
const KEYBOARD_MIN_PX = 80;
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

const findScroller = (field: HTMLElement) => {
  const dialog = field.closest('[role="dialog"]');
  const scroller = Array.from(
    dialog?.querySelectorAll<HTMLElement>('*') ?? [],
  ).filter((node) => {
    const { overflowY } = getComputedStyle(node);
    return (
      (overflowY === 'auto' || overflowY === 'scroll') && node.contains(field)
    );
  });
  return scroller.pop() ?? null;
};

/** Keeps a focused field inside a sheet visible when the phone's keyboard shrinks the visual viewport. While the keyboard is up the sheet's scroller gets its height as bottom padding, so even a short sheet can scroll the field clear. */
export function useKeepFocusedFieldInView(isActive: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isActive || !viewport) return;
    const padded = new Map<HTMLElement, string>();

    const release = () => {
      padded.forEach((value, node) => {
        node.style.paddingBottom = value;
      });
      padded.clear();
    };

    const reveal = () => {
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !field.matches(FIELD_SELECTOR)) {
        release();
        return;
      }
      const scroller = findScroller(field);
      if (!scroller) return;

      const visibleBottom = viewport.offsetTop + viewport.height;
      if (window.innerHeight - visibleBottom < KEYBOARD_MIN_PX) {
        release();
        return;
      }

      if (!padded.has(scroller)) {
        padded.set(scroller, scroller.style.paddingBottom);
        const own = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
        const reach = scroller.getBoundingClientRect().bottom - visibleBottom;
        scroller.style.paddingBottom = `${own + Math.max(0, reach)}px`;
      }

      const bounds = scroller.getBoundingClientRect();
      const top = Math.max(bounds.top, viewport.offsetTop) + EDGE_GAP_PX;
      const bottom = Math.min(bounds.bottom, visibleBottom) - EDGE_GAP_PX;
      const rect = field.getBoundingClientRect();
      if (rect.top >= top && rect.bottom <= bottom) return;

      const delta = (rect.top + rect.bottom) / 2 - (top + bottom) / 2;
      scroller.scrollBy({ top: delta, behavior: 'smooth' });
    };

    const handleFocus = () => window.requestAnimationFrame(reveal);
    const handleBlur = () => window.setTimeout(reveal, 100);

    viewport.addEventListener('resize', reveal);
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);
    return () => {
      viewport.removeEventListener('resize', reveal);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
      release();
    };
  }, [isActive]);
}

export default useKeepFocusedFieldInView;
