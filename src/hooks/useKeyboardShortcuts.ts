import { useEffect, useRef } from 'react';

const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const OPEN_LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"]';

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
        document.querySelector(OPEN_LAYER_SELECTOR)
      )
        return;
      const handler = handlersRef.current[keyEvent.key.toLowerCase()];
      if (!handler) return;
      keyEvent.preventDefault();
      handler();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
