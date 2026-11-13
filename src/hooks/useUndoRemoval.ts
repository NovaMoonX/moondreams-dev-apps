import { useCallback, useEffect, useState } from 'react';

import { UNDO_WINDOW_MS } from '@/lib/undo';

const UNDO_SECONDS = UNDO_WINDOW_MS / 1000;

export interface PendingUndo {
  message: string;
  secondsLeft: number;
}

interface Removal {
  message: string;
  restore: () => void;
  expiresAt: number;
}

/** One pending "Removed X · Undo" countdown for a form; `restore` runs on Undo and must read the latest state. */
export function useUndoRemoval() {
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(UNDO_SECONDS);

  useEffect(() => {
    if (removal === null) {
      return;
    }
    const { expiresAt } = removal;
    const timer = window.setInterval(() => {
      const left = Math.ceil((expiresAt - Date.now()) / 1000);
      if (left <= 0) {
        setRemoval(null);
        return;
      }
      setSecondsLeft(left);
    }, 250);
    return () => window.clearInterval(timer);
  }, [removal]);

  const showUndo = useCallback((message: string, restore: () => void) => {
    setSecondsLeft(UNDO_SECONDS);
    setRemoval({ message, restore, expiresAt: Date.now() + UNDO_WINDOW_MS });
  }, []);

  const undo = useCallback(() => {
    removal?.restore();
    setRemoval(null);
  }, [removal]);

  const pending: PendingUndo | null =
    removal === null ? null : { message: removal.message, secondsLeft };

  return { pending, showUndo, undo };
}
