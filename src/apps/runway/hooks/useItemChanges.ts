import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { startChangesListener } from '@apps/runway/store/listeners/changeListeners';
import type { OpenChange } from '@apps/runway/types';
import { getChangeWindow } from '@apps/runway/utils/changeWindow';

const YEAR_DAYS = 365;

interface ItemChangesState {
  changes: OpenChange[] | null;
  isFailed: boolean;
}

/** Every change to one item over the past year, newest first, read for the view that shows it so the sheet around it keeps its own reads; `from` is the first day it covers. */
export function useItemChanges(itemId: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<ItemChangesState>({
    changes: null,
    isFailed: false,
  });
  const [from] = useState(
    () => getChangeWindow(todayAsUtcDate(), YEAR_DAYS, 0).from,
  );

  useEffect(() => {
    if (!uid) return;
    const run = { isCurrent: true };
    const stop: { current: (() => void) | null } = { current: null };
    const window = getChangeWindow(todayAsUtcDate(), YEAR_DAYS, 0);
    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startChangesListener(
          uid,
          encryption,
          { from: window.from, to: window.to, itemId },
          (changes) => setState({ changes, isFailed: false }),
          (error) => {
            console.error('The history did not open', error);
            setState({ changes: null, isFailed: true });
          },
        );
      })
      .catch(() => {
        if (run.isCurrent) setState({ changes: null, isFailed: true });
      });
    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, itemId]);

  return { ...state, from };
}
