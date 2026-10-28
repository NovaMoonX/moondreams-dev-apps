const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** Whether a sheet may put a text field's focus in place on open: only with a mouse, since on a touch screen it raises the keyboard unasked. */
export const canFocusFieldOnOpen = () =>
  typeof window !== 'undefined' &&
  window.matchMedia(FINE_POINTER_QUERY).matches;

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
