import { useRef, type TouchEvent } from 'react';

const MIN_DISTANCE_PX = 56;

interface Start {
  id: number;
  x: number;
  y: number;
}

/** Touch handlers that call `onSwipe` after a quick, mostly horizontal swipe to the right. Spread them on a strip no content scrolls sideways in; touches that start in a portaled child (a modal, a dropdown) are ignored. */
export function useSwipeRight(onSwipe: () => void) {
  const startRef = useRef<Start | null>(null);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    const isOwn = event.currentTarget.contains(event.target as Node);
    startRef.current =
      touch && isOwn && event.touches.length === 1
        ? { id: touch.identifier, x: touch.clientX, y: touch.clientY }
        : null;
  };

  const onTouchEnd = (event: TouchEvent) => {
    const start = startRef.current;
    const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === start?.id);
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
