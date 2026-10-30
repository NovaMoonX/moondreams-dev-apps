import { useRef, type MouseEvent, type PointerEvent } from 'react';

/** How long a finger rests on something before it counts as a press and hold. */
export const LONG_PRESS_MS = 450;

/**
 * Press and hold on touch or pen, right-click or the context-menu key on a computer, all calling
 * `onLongPress`; spread the handlers on a link or button and its ordinary tap still works. A scroll
 * cancels the hold, the tap that ends a hold doesn't also activate the element, and nothing gets selected
 * while the finger is down.
 */
const HOLDING_ATTRIBUTE = 'data-pressing';

const preventDefault = (event: Event) => event.preventDefault();

/**
 * While a finger rests on a hold target, nothing on the page can be selected or open the phone's own menu:
 * what the hold opens slides in under the finger, and the phone's long press would otherwise land there.
 */
function guardPageUntilRelease() {
  const root = document.documentElement;
  if (root.hasAttribute(HOLDING_ATTRIBUTE)) return;
  root.setAttribute(HOLDING_ATTRIBUTE, '');
  document.addEventListener('selectstart', preventDefault, true);
  document.addEventListener('contextmenu', preventDefault, true);

  const release = () => {
    root.removeAttribute(HOLDING_ATTRIBUTE);
    document.removeEventListener('selectstart', preventDefault, true);
    document.removeEventListener('contextmenu', preventDefault, true);
    window.removeEventListener('pointerup', release, true);
    window.removeEventListener('pointercancel', release, true);
    window.removeEventListener('touchend', release, true);
    window.getSelection()?.removeAllRanges();
  };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('touchend', release, true);
}

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
      guardPageUntilRelease();
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
