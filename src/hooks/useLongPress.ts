import { useRef, type MouseEvent, type PointerEvent } from 'react';

/** How long a finger rests on something before it counts as a press and hold. */
export const LONG_PRESS_MS = 450;

/**
 * Press and hold on touch or pen, right-click or the context-menu key on a computer, all calling
 * `onLongPress`; spread the handlers on a link or button and its ordinary tap still works. A scroll
 * cancels the hold, and the tap that ends a hold doesn't also activate the element.
 */
export function useLongPress(onLongPress: () => void, delayMs = LONG_PRESS_MS) {
  const timerRef = useRef<number | null>(null);
  const didHoldRef = useRef(false);

  const cancel = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  return {
    onPointerDown: (event: PointerEvent) => {
      didHoldRef.current = false;
      cancel();
      // A mouse has right-click for this, so a slow click still activates the element.
      if (event.pointerType === 'mouse') return;
      timerRef.current = window.setTimeout(() => {
        didHoldRef.current = true;
        onLongPress();
      }, delayMs);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      cancel();
      if (!didHoldRef.current) onLongPress();
    },
    onClick: (event: MouseEvent) => {
      if (didHoldRef.current) event.preventDefault();
      didHoldRef.current = false;
    },
  };
}
