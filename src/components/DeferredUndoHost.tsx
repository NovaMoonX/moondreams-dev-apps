import { useEffect, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import UndoSnackbar from '@/components/UndoSnackbar';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import {
  commitAllDeferred,
  onDeferredFailure,
  undoDeferred,
  useDeferredActions,
} from '@/lib/undo/deferredUndo';

/** The one Undo bar for actions written after their Undo passes; mounted once at the site's root so it outlives the sheet that started the action. */
function DeferredUndoHost() {
  const pending = useDeferredActions();
  const { addToast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const latest = pending.at(-1) ?? null;

  useEffect(() => {
    if (latest === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [latest]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') commitAllDeferred();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', commitAllDeferred);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', commitAllDeferred);
    };
  }, []);

  useEffect(
    () =>
      onDeferredFailure((message) =>
        addToast({ title: message, type: 'error' }),
      ),
    [addToast],
  );

  const undoable =
    latest === null
      ? null
      : {
          message: latest.message,
          secondsLeft: Math.min(
            UNDO_WINDOW_MS / 1000,
            Math.max(1, Math.ceil((latest.expiresAt - now) / 1000)),
          ),
        };

  return (
    <UndoSnackbar
      pending={undoable}
      onUndo={() => latest !== null && undoDeferred(latest.key)}
      isOverSheet
    />
  );
}

export default DeferredUndoHost;
