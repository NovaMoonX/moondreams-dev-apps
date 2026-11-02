import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { MOVE_WORDS, PAID_HISTORY_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { undoPaymentPaid } from '@apps/runway/hooks/useBillPaid';
import { undoTransfer } from '@apps/runway/store/actions/transferActions';
import type { ChangeMove } from '@apps/runway/types';

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Takes one move of money, or one payment marked paid, back and toasts the outcome; resolves true when it was undone. */
export function useUndoTransfer() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  return async (moved: Omit<ChangeMove, 'isUndo'>) => {
    if (!user) return false;
    try {
      if (moved.bill) {
        const isWritten = await undoPaymentPaid(
          user.uid,
          moved.bill.billId,
          moved.bill.name,
          {
            moveId: moved.moveId,
            dueOn: moved.bill.dueOn,
            amountCents: moved.bill.amountCents,
            paidOn: moved.bill.paidOn,
            fromFreeCents: moved.bill.fromFreeCents,
            cardId: moved.bill.cardId,
          },
        );
        if (!isWritten) {
          addToast({
            title: PAID_HISTORY_WORDS.alreadyTakenBack(moved.bill.name),
            type: 'info',
          });
          return false;
        }
      } else {
        const encryption = await getRunwayEncryption(user.uid);
        await undoTransfer(user.uid, encryption, moved);
      }
      addToast({ title: mask(moved.undoText), type: 'success' });
      return true;
    } catch (undoError) {
      addToast({
        title: MOVE_WORDS.undoFailed,
        description: isOfflineFailure(undoError)
          ? MOVE_WORDS.offline
          : getErrorMessage(undoError, MOVE_WORDS.failed),
        type: 'error',
      });
      return false;
    }
  };
}
