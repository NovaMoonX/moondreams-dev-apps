import { useRef, type PointerEvent, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

const SWIPE_MIN_PX = 60;
const SWIPE_SLOP_PX = 10;
const SWIPE_AXIS_RATIO = 1.5;
const ZOOMED_SCALE = 1.05;

interface SwipeAreaProps {
  children: ReactNode;
  /** 1 for a swipe to the left (forward), -1 for a swipe to the right (back). */
  onSwipe: (direction: 1 | -1) => void;
  /** Follows a sideways drag as it happens (`dx` is the finger's travel); `isEnd` is true once the finger lifts or is cancelled, after `onSwipe` when it counted. */
  onDrag?: (dx: number, isEnd: boolean) => void;
  className?: string;
}

/** A block that turns a sideways touch or pen swipe into forward or back; vertical scrolling and pinch-zoom stay the browser's, a zoomed-in page never swipes, and a child marked `data-no-swipe` (a sideways scroller) keeps its swipes. */
function SwipeArea({ children, onSwipe, onDrag, className }: SwipeAreaProps) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const endDrag = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    onDrag?.(0, true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    if (
      !start ||
      !onDrag ||
      (window.visualViewport?.scale ?? 1) > ZOOMED_SCALE
    ) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (
      Math.abs(dx) < SWIPE_SLOP_PX ||
      Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO
    ) {
      return;
    }
    isDragging.current = true;
    onDrag(dx, false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const isOptedOut =
      event.target instanceof Element &&
      event.target.closest('[data-no-swipe]') !== null;
    swipeStart.current =
      event.pointerType === 'mouse' || !event.isPrimary || isOptedOut
        ? null
        : { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || (window.visualViewport?.scale ?? 1) > ZOOMED_SCALE) {
      endDrag();
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
    endDrag();
  };

  return (
    <div
      className={join('touch-pan-y touch-pinch-zoom', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStart.current = null;
        endDrag();
      }}
    >
      {children}
    </div>
  );
}

export default SwipeArea;
