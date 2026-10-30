import { useRef, type MouseEvent, type PointerEvent } from 'react';

/** How long a finger rests on something before it counts as a press and hold. */
export const LONG_PRESS_MS = 450;

const HOLDING_ATTRIBUTE = 'data-pressing';

const preventDefault = (event: Event) => event.preventDefault();

let releaseGuard: (() => void) | null = null;

// What a hold opens slides in under the finger, where the phone's own long press would select text.
// A new hold replaces the last guard, so a lost pointerup can never leave the page unselectable.
function guardPageUntilRelease(pointerId: number, didHold: () => boolean) {
  releaseGuard?.();
  const root = document.documentElement;
  root.setAttribute(HOLDING_ATTRIBUTE, '');
  document.addEventListener('selectstart', preventDefault, true);
  document.addEventListener('contextmenu', preventDefault, true);

  const release = () => {
    root.removeAttribute(HOLDING_ATTRIBUTE);
    document.removeEventListener('selectstart', preventDefault, true);
    document.removeEventListener('contextmenu', preventDefault, true);
    window.removeEventListener('pointerup', onPointerEnd, true);
    window.removeEventListener('pointercancel', onPointerEnd, true);
    if (didHold()) window.getSelection()?.removeAllRanges();
    releaseGuard = null;
  };
  const onPointerEnd = (event: globalThis.PointerEvent) => {
    if (event.pointerId === pointerId) release();
  };
  window.addEventListener('pointerup', onPointerEnd, true);
  window.addEventListener('pointercancel', onPointerEnd, true);
  releaseGuard = release;
}

/**
 * Press and hold on touch or pen, right-click or the context-menu key on a computer, all calling
 * `onLongPress`; spread the handlers on a link or button and its ordinary tap still works. A scroll
 * cancels the hold, the tap that ends a hold doesn't also activate the element, and nothing gets selected
 * while the finger is down.
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
      guardPageUntilRelease(event.pointerId, () => didHoldRef.current);
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
