import { useRef, type PointerEvent, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

const SWIPE_MIN_PX = 60;
const SWIPE_AXIS_RATIO = 1.5;
const ZOOMED_SCALE = 1.05;

interface SwipeAreaProps {
  children: ReactNode;
  /** 1 for a swipe to the left (forward), -1 for a swipe to the right (back). */
  onSwipe: (direction: 1 | -1) => void;
  className?: string;
}

/** A block that turns a sideways touch or pen swipe into forward or back; vertical scrolling and pinch-zoom stay the browser's, and a zoomed-in page never swipes. */
function SwipeArea({ children, onSwipe, className }: SwipeAreaProps) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStart.current =
      event.pointerType === 'mouse' || !event.isPrimary
        ? null
        : { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || (window.visualViewport?.scale ?? 1) > ZOOMED_SCALE) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (
      Math.abs(dx) >= SWIPE_MIN_PX &&
      Math.abs(dx) >= Math.abs(dy) * SWIPE_AXIS_RATIO
    ) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  };

  return (
    <div
      className={join('touch-pan-y touch-pinch-zoom', className)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStart.current = null;
      }}
    >
      {children}
    </div>
  );
}

export default SwipeArea;
