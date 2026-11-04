import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentProps,
} from 'react';

import { Drawer as LibraryDrawer } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

type DrawerProps = Omit<
  ComponentProps<typeof LibraryDrawer>,
  'enableDragGestures' | 'ref'
>;

const START_SLOP_PX = 8;
const CLOSE_SHARE = 0.3;
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_PX = 48;
const SETTLE_MS = 220;
const STILL_OPEN_CHECKS_MS = [60, 320];

const HANDLE =
  "[&>div]:pt-5 before:pointer-events-none before:absolute before:top-2 before:left-1/2 before:z-10 before:h-1.5 before:w-12 before:-translate-x-1/2 before:rounded-full before:bg-popover-foreground/35 before:content-['']";
const QUIET_CLOSE = '[&_[data-drawer-close-button]]:sr-only';
const QUIET_CLOSE_ON_TOUCH =
  '[@media(pointer:coarse)]:[&_[data-drawer-close-button]]:sr-only';

const isScrolledAway = (target: Element, surface: HTMLElement) => {
  const chain = (node: Element | null): boolean => {
    if (!node || node === surface) return false;
    const { overflowY } = getComputedStyle(node);
    const scrolls =
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight;
    if (scrolls && node.scrollTop > 0) return true;
    return chain(node.parentElement);
  };
  return chain(target);
};

const keepsItsTouch = (target: Element) =>
  target.closest(
    '[data-no-swipe], input[type="range"], [role="slider"], [contenteditable="true"]',
  ) !== null;

const attachSwipe = (surface: HTMLElement, close: () => void) => {
  const state = {
    id: -1,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastAt: 0,
    speed: 0,
    phase: 'idle' as 'idle' | 'waiting' | 'dragging' | 'ignored',
    distance: 0,
  };

  const place = (y: number, isAnimated: boolean) => {
    surface.style.transition = isAnimated
      ? `transform ${SETTLE_MS}ms ease-out`
      : 'none';
    surface.style.transform = y === 0 ? '' : `translateY(${y}px)`;
    if (y === 0 && isAnimated) {
      window.setTimeout(() => {
        if (!surface.style.transform) surface.style.transition = '';
      }, SETTLE_MS);
    }
  };

  const onStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    const target = event.target;
    const isEligible =
      event.touches.length === 1 &&
      touch !== undefined &&
      target instanceof Element &&
      surface.contains(target) &&
      !keepsItsTouch(target) &&
      !isScrolledAway(target, surface);
    if (state.phase === 'dragging') place(0, true);
    state.phase = isEligible ? 'waiting' : 'ignored';
    if (!isEligible) return;
    state.id = touch.identifier;
    state.startX = touch.clientX;
    state.startY = touch.clientY;
    state.lastY = touch.clientY;
    state.lastAt = event.timeStamp;
    state.speed = 0;
    state.distance = 0;
  };

  const onMove = (event: TouchEvent) => {
    if (state.phase === 'idle' || state.phase === 'ignored') return;
    if (event.touches.length > 1) {
      state.phase = 'ignored';
      place(0, true);
      return;
    }
    const touch = Array.from(event.touches).find(
      (one) => one.identifier === state.id,
    );
    if (!touch) return;
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;
    if (state.phase === 'waiting') {
      if (Math.abs(dx) < START_SLOP_PX && Math.abs(dy) < START_SLOP_PX) return;
      const isDown = dy > 0 && dy > Math.abs(dx) && event.cancelable;
      state.phase = isDown ? 'dragging' : 'ignored';
      if (state.phase === 'ignored') return;
      state.startY = touch.clientY;
    }
    if (event.cancelable) event.preventDefault();
    const gap = event.timeStamp - state.lastAt;
    if (gap > 0) state.speed = (touch.clientY - state.lastY) / gap;
    state.lastY = touch.clientY;
    state.lastAt = event.timeStamp;
    state.distance = Math.max(0, touch.clientY - state.startY);
    place(state.distance, false);
  };

  const onEnd = (event: TouchEvent) => {
    const wasDragging = state.phase === 'dragging';
    state.phase = 'idle';
    if (!wasDragging) return;
    const isRecent = event.timeStamp - state.lastAt < 100;
    const isFlick =
      state.distance >= FLICK_MIN_PX &&
      isRecent &&
      state.speed >= FLICK_PX_PER_MS;
    const isFar = state.distance >= surface.offsetHeight * CLOSE_SHARE;
    if (!isFlick && !isFar) {
      place(0, true);
      return;
    }
    surface.style.transition = `transform ${SETTLE_MS}ms ease-out`;
    surface.style.transform = 'translateY(100%)';
    close();
    // A close that asks first (unsaved typing) leaves the drawer open, so it comes back up.
    const comeBackIfOpen = () => {
      const root = surface.closest('[role="dialog"]');
      const isStillOpen =
        surface.isConnected &&
        root?.getAttribute('data-drawer-open') === 'true';
      if (isStillOpen && surface.style.transform) place(0, true);
    };
    STILL_OPEN_CHECKS_MS.forEach((ms) => window.setTimeout(comeBackIfOpen, ms));
  };

  const onCancel = () => {
    if (state.phase === 'dragging') place(0, true);
    state.phase = 'idle';
  };

  surface.addEventListener('touchstart', onStart, { passive: true });
  surface.addEventListener('touchmove', onMove, { passive: false });
  surface.addEventListener('touchend', onEnd);
  surface.addEventListener('touchcancel', onCancel);
  return () => {
    surface.removeEventListener('touchstart', onStart);
    surface.removeEventListener('touchmove', onMove);
    surface.removeEventListener('touchend', onEnd);
    surface.removeEventListener('touchcancel', onCancel);
  };
};

/**
 * Dreamer UI's bottom drawer, made to feel native: the whole sheet follows a downward swipe (content
 * only once it is scrolled to the top) and a swipe closes it exactly as its close control would. The
 * close control stays for screen readers but is drawn only for a mouse, and only when asked for.
 */
function Drawer({
  onClose,
  showCloseButton = false,
  className,
  ...props
}: DrawerProps) {
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  const attach = useCallback((surface: HTMLDivElement | null) => {
    if (!surface) return;
    return attachSwipe(surface, () => closeRef.current());
  }, []);

  return (
    <LibraryDrawer
      {...props}
      ref={attach}
      onClose={onClose}
      showCloseButton
      enableDragGestures={false}
      className={join(
        HANDLE,
        showCloseButton ? QUIET_CLOSE_ON_TOUCH : QUIET_CLOSE,
        className,
      )}
    />
  );
}

export default Drawer;
