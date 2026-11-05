import { useEffect, useRef, useState } from 'react';

const SLOP_PX = 8;
const ZOOMED_SCALE = 1.05;
const IGNORED_TARGETS = '[role="dialog"], [data-no-pull]';

const isScrolledDown = (target: EventTarget | null) => {
  const climb = (element: Element | null): boolean => {
    if (!element) return false;
    const { overflowY } = getComputedStyle(element);
    const isScroller = overflowY === 'auto' || overflowY === 'scroll';
    return (
      (isScroller && element.scrollTop > 0) || climb(element.parentElement)
    );
  };
  return target instanceof Element && climb(target);
};

interface PullDownOptions {
  isEnabled: boolean;
  /** Lets an upward drag take hold too, for a page whose top is already opened and should fold back; `distance` then goes negative. */
  canPullUp?: boolean;
  /** Finger travel, from where the pull took hold, past which lifting the finger fires `onRefresh`. */
  refreshAt: number;
  onRefresh: () => void;
  /** The finger lifted short of `refreshAt`, with how far it had travelled (below zero after pulling back up past the start). */
  onRelease: (distance: number) => void;
}

interface Gesture {
  id: number;
  x: number;
  y: number;
  isPulling: boolean;
}

/**
 * A pull down from the top of the page: `distance` is the finger's travel since the pull took hold (negative
 * when it comes back up past that point), 0 when idle. It starts only on a mostly vertical downward drag (or an upward one when `canPullUp` says so)
 * while the page is at the top and nothing under the finger is a scroller scrolled down, not in a dialog or a `data-no-pull` area; from then on the page's own scroll
 * is cancelled until the finger lifts. Lifting at or past `refreshAt` fires `onRefresh`, so sliding back up first cancels it; `onRelease` is called otherwise.
 * While enabled the page's overscroll is contained so the phone's own pull-to-reload never runs on top of it.
 */
export function usePullDown(options: PullDownOptions) {
  const [distance, setDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  const { isEnabled } = options;
  useEffect(() => {
    if (!isEnabled) return;
    const root = document.documentElement;
    const before = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    const state: { gesture: Gesture | null } = { gesture: null };

    const find = (list: TouchList) =>
      Array.from(list).find((touch) => touch.identifier === state.gesture?.id);
    const end = () => {
      state.gesture = null;
      setDistance(0);
      setIsPulling(false);
    };

    const onStart = (event: TouchEvent) => {
      // A pull whose lift never arrived (the browser took the touch) ends when the next one starts.
      if (state.gesture?.isPulling) onCancel();
      const touch = event.touches[0];
      const isIgnored =
        event.target instanceof Element &&
        event.target.closest(IGNORED_TARGETS) !== null;
      const isZoomed = (window.visualViewport?.scale ?? 1) > ZOOMED_SCALE;
      state.gesture =
        touch &&
        event.touches.length === 1 &&
        window.scrollY <= 0 &&
        !isIgnored &&
        !isScrolledDown(event.target) &&
        !isZoomed
          ? {
              id: touch.identifier,
              x: touch.clientX,
              y: touch.clientY,
              isPulling: false,
            }
          : null;
    };

    const onMove = (event: TouchEvent) => {
      const { gesture } = state;
      const touch = gesture ? find(event.touches) : undefined;
      if (!gesture || !touch) return;
      if (!gesture.isPulling) {
        const dy = touch.clientY - gesture.y;
        const dx = touch.clientX - gesture.x;
        if (Math.abs(dy) < SLOP_PX && Math.abs(dx) < SLOP_PX) return;
        const isWrongWay = dy < 0 ? !optionsRef.current.canPullUp : dy === 0;
        if (isWrongWay || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          state.gesture = null;
          return;
        }
        // The pull takes hold here, so the page does not jump by the slop that came before it.
        gesture.isPulling = true;
        gesture.y = touch.clientY;
        setIsPulling(true);
      }
      if (event.cancelable) event.preventDefault();
      setDistance(touch.clientY - gesture.y);
    };

    const onEnd = (event: TouchEvent) => {
      const { gesture } = state;
      const touch = gesture ? find(event.changedTouches) : undefined;
      if (!gesture || !touch) return;
      const wasPulling = gesture.isPulling;
      const travelled = touch.clientY - gesture.y;
      end();
      if (!wasPulling) return;
      if (travelled >= optionsRef.current.refreshAt)
        optionsRef.current.onRefresh();
      else optionsRef.current.onRelease(travelled);
    };

    const onCancel = () => {
      const wasPulling = state.gesture?.isPulling ?? false;
      end();
      if (wasPulling) optionsRef.current.onRelease(0);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
    return () => {
      root.style.overscrollBehaviorY = before;
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [isEnabled]);

  return { distance, isPulling };
}
