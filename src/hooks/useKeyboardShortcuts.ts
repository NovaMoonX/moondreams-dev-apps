import { useEffect, useRef } from 'react';

const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"]';

// A closed popover stays in the page as an invisible, inert dialog, so only a shown one counts.
const isLayerOpen = () =>
  Array.from(document.querySelectorAll(LAYER_SELECTOR)).some((layer) => {
    const style = getComputedStyle(layer);
    return (
      style.pointerEvents !== 'none' &&
      style.opacity !== '0' &&
      style.visibility !== 'hidden'
    );
  });

/** The platform's command key as printed on a keycap: ⌘ on Apple devices, Ctrl elsewhere. */
export const getModifierKeyLabel = () =>
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl';

/** Runs the handler for a pressed key (lower-case; `?` for Shift+/) while `isEnabled`. A plain key is ignored while typing in a field or with a dialog or drawer open, and with Ctrl, Meta or Alt held. A `mod+<key>` handler (`mod+k`) answers ⌘ on Apple devices and Ctrl elsewhere, and works while typing and over a dialog. */
export function useKeyboardShortcuts(
  handlers: Record<string, () => void>,
  isEnabled: boolean,
) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!isEnabled) return undefined;
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.repeat) return;
      const key = keyEvent.key?.toLowerCase() ?? '';
      if (keyEvent.ctrlKey || keyEvent.metaKey) {
        const combo = keyEvent.altKey
          ? undefined
          : handlersRef.current[`mod+${key}`];
        if (!combo) return;
        keyEvent.preventDefault();
        combo();
        return;
      }
      if (keyEvent.altKey) return;
      const target =
        keyEvent.target instanceof Element ? keyEvent.target : null;
      if (target?.closest(TYPING_SELECTOR) || isLayerOpen()) return;
      const handler = handlersRef.current[key];
      if (!handler) return;
      keyEvent.preventDefault();
      handler();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
