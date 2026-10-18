import { useRef, type TouchEvent } from 'react';

const MIN_DISTANCE_PX = 56;

/** Touch handlers that call `onSwipe` after a quick, mostly horizontal swipe to the right. Spread them on a strip no content scrolls sideways in. */
export function useSwipeRight(onSwipe: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    startRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: TouchEvent) => {
    const start = startRef.current;
    const touch = event.changedTouches[0];
    startRef.current = null;
    if (!start || !touch) {
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx >= MIN_DISTANCE_PX && dx > Math.abs(dy) * 2) {
      onSwipe();
    }
  };

  const onTouchCancel = () => {
    startRef.current = null;
  };

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
