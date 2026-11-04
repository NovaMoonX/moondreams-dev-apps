import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useStore } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { selectAccounts } from '@apps/runway/store/selectors/runwaySelectors';
import {
  undoAccountHolds,
  type WrittenHolds,
} from '@apps/runway/store/actions/accountActions';

/** Toasts a saved change to what accounts hold with an Undo that reverses exactly that save, once, and reports what it could not. */
export function useHoldsUndo() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const store = useStore<RootState>();

  const undo = async (written: WrittenHolds[]) => {
    if (!user) return;
    const names = written.map((entry) => entry.name);
    try {
      const skipped = await undoAccountHolds(
        user.uid,
        await getRunwayEncryption(user.uid),
        written,
        selectAccounts(store.getState()),
        ACCOUNT_WORDS.changeHoldsUndone(names),
      );
      if (skipped.length === 0) {
        addToast({
          title: ACCOUNT_WORDS.changeHoldsUndone(names),
          type: 'success',
        });
        return;
      }
      addToast({
        title: ACCOUNT_WORDS.holdsNotUndone,
        description: ACCOUNT_WORDS.holdsChangedSince(skipped),
        type: 'error',
      });
    } catch (undoError) {
      addToast({
        title: ACCOUNT_WORDS.holdsNotUndone,
        description: getErrorMessage(undoError, ACCOUNT_WORDS.failed),
        type: 'error',
      });
    }
  };

  return (title: string, written: WrittenHolds[]) => {
    if (written.length === 0) return;
    const state = { hasRun: false };
    addToast({
      title,
      type: 'success',
      action: {
        label: ACCOUNT_WORDS.undo,
        onClick: () => {
          if (state.hasRun) return;
          state.hasRun = true;
          void undo(written);
        },
      },
    });
  };
}
