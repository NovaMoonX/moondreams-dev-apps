import { useCallback, useEffect, useState } from 'react';

const UNDO_SECONDS = 6;

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
export function useUndoRemoval(seconds = UNDO_SECONDS) {
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(seconds);

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

  const showUndo = useCallback(
    (message: string, restore: () => void) => {
      setSecondsLeft(seconds);
      setRemoval({ message, restore, expiresAt: Date.now() + seconds * 1000 });
    },
    [seconds],
  );

  const undo = useCallback(() => {
    removal?.restore();
    setRemoval(null);
  }, [removal]);

  const pending: PendingUndo | null =
    removal === null ? null : { message: removal.message, secondsLeft };

  return { pending, showUndo, undo };
}
