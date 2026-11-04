import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  undoAccountHolds,
  type WrittenHolds,
} from '@apps/runway/store/actions/accountActions';

/** Toasts a saved change to what accounts hold with an Undo that reverses exactly that save and reports what it could not. */
export function useHoldsUndo() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const undo = async (written: WrittenHolds[], accountName: string) => {
    if (!user) return;
    try {
      const skipped = await undoAccountHolds(
        user.uid,
        await getRunwayEncryption(user.uid),
        written,
        ACCOUNT_WORDS.changeHoldsUndone(accountName),
      );
      if (skipped.length === 0) {
        addToast({
          title: ACCOUNT_WORDS.changeHoldsUndone(accountName),
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

  return (title: string, written: WrittenHolds[], accountName: string) =>
    addToast({
      title,
      type: 'success',
      action: {
        label: ACCOUNT_WORDS.undo,
        onClick: () => void undo(written, accountName),
      },
    });
}
