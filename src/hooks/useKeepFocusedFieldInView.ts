import { useEffect } from 'react';

const EDGE_GAP_PX = 12;
const KEYBOARD_MIN_PX = 80;
const SETTLE_MS = 120;
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const DRAWER_ANCHOR_SELECTOR = '[role="dialog"][data-drawer-open] > .fixed.bottom-0';

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/**
 * Runs `callback` once the drawer around `node` has finished sliding in, or after `maxMs` if nothing
 * is animating. Outside a drawer it runs after `maxMs` too. Returns a cancel function.
 */
export function runWhenDrawerSettled(
  node: HTMLElement | null,
  callback: () => void,
  maxMs = 450,
) {
  const panel = node?.closest<HTMLElement>(
    '[role="dialog"][data-drawer-open] .transform',
  );
  const state = { isDone: false, frame: 0, timer: 0 };
  const finish = () => {
    if (state.isDone) return;
    state.isDone = true;
    window.clearTimeout(state.timer);
    window.cancelAnimationFrame(state.frame);
    callback();
  };
  state.timer = window.setTimeout(finish, maxMs);
  if (panel) {
    state.frame = window.requestAnimationFrame(() => {
      state.frame = window.requestAnimationFrame(() => {
        const running = panel
          .getAnimations()
          .filter((animation) => animation.playState === 'running');
        if (running.length === 0) {
          finish();
          return;
        }
        Promise.allSettled(running.map((animation) => animation.finished)).then(
          finish,
        );
      });
    });
  }
  return () => {
    state.isDone = true;
    window.clearTimeout(state.timer);
    window.cancelAnimationFrame(state.frame);
  };
}

/** Focuses a field without letting the browser scroll the page or the sheet to it. */
export const focusFieldQuietly = (field: HTMLElement | null) =>
  field?.focus({ preventScroll: true });

/**
 * While the phone's keyboard is up, the open drawer is lifted onto it and capped to the visible area,
 * so its pinned footer sits right on the keyboard with nothing padded; the focused field is then
 * scrolled smoothly into the sheet's own scroller once the viewport has settled, and not at all when
 * it is already visible.
 */
export function useKeepFocusedFieldInView(isActive: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isActive || !viewport) return;
    const lifted = new Set<HTMLElement>();
    const state = { timer: 0 };

    const release = () => {
      lifted.forEach((anchor) => {
        anchor.style.removeProperty('bottom');
        anchor.style.removeProperty('--keyboard-max-height');
      });
      lifted.clear();
    };

    const getKeyboardHeight = () =>
      Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height));

    const lift = (anchor: HTMLElement) => {
      const keyboard = getKeyboardHeight();
      lifted.add(anchor);
      anchor.style.bottom = `${keyboard}px`;
      anchor.style.setProperty(
        '--keyboard-max-height',
        `${Math.max(0, viewport.height - EDGE_GAP_PX)}px`,
      );
    };

    const reveal = () => {
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !field.matches(FIELD_SELECTOR)) {
        return;
      }
      const scroller = findScroller(field);
      if (!scroller) return;
      const bounds = scroller.getBoundingClientRect();
      const footer = scroller.querySelector<HTMLElement>('.form-footer');
      const footerTop = footer ? footer.getBoundingClientRect().top : Infinity;
      const top = Math.max(bounds.top, viewport.offsetTop) + EDGE_GAP_PX;
      const bottom =
        Math.min(
          bounds.bottom,
          viewport.offsetTop + viewport.height,
          footerTop,
        ) - EDGE_GAP_PX;
      const rect = field.getBoundingClientRect();
      if (rect.top >= top && rect.bottom <= bottom) return;

      const delta = rect.top < top ? rect.top - top : rect.bottom - bottom;
      scroller.scrollBy({
        top: delta,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    };

    const update = () => {
      const anchor = document.querySelector<HTMLElement>(
        DRAWER_ANCHOR_SELECTOR,
      );
      if (!anchor) return;
      if (getKeyboardHeight() < KEYBOARD_MIN_PX) {
        release();
        return;
      }
      lift(anchor);
    };

    const handleViewport = () => {
      update();
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(reveal, SETTLE_MS);
    };

    const handleFocus = () => {
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(reveal, SETTLE_MS);
    };

    viewport.addEventListener('resize', handleViewport);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', handleFocus);
    return () => {
      window.clearTimeout(state.timer);
      viewport.removeEventListener('resize', handleViewport);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', handleFocus);
      release();
    };
  }, [isActive]);
}

export default useKeepFocusedFieldInView;
