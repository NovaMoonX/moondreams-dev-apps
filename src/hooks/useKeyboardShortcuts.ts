import { useEffect, useRef } from 'react';

const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"]';

// A closed popover stays in the page as an invisible, inert dialog, so only a shown one counts.
const isLayerOpen = () =>
  Array.from(document.querySelectorAll(LAYER_SELECTOR)).some((layer) => {
    const style = getComputedStyle(layer);
    return style.pointerEvents !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
  });

/** Runs the handler for a pressed key (lower-case; `?` for Shift+/) while `isEnabled`. Desktop only: ignores typing in a field, an open dialog or drawer, and Ctrl, Meta or Alt. */
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
      if (
        keyEvent.ctrlKey ||
        keyEvent.metaKey ||
        keyEvent.altKey ||
        keyEvent.repeat
      )
        return;
      const target =
        keyEvent.target instanceof Element ? keyEvent.target : null;
      if (
        target?.closest(TYPING_SELECTOR) ||
        isLayerOpen()
      )
        return;
      const handler = handlersRef.current[keyEvent.key?.toLowerCase() ?? ''];
      if (!handler) return;
      keyEvent.preventDefault();
      handler();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
