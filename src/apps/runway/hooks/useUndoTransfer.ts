import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppSelector } from '@/store';

import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  COST_PAID_WORDS,
  MOVE_WORDS,
  PAID_HISTORY_WORDS,
} from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { undoCostPayment } from '@apps/runway/hooks/useCostPaid';
import { undoPaymentPaid } from '@apps/runway/hooks/useBillPaid';
import { getPurchaseMarkFigures } from '@apps/runway/engine/horizon';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectSpendPurchases } from '@apps/runway/store/selectors/runwaySelectors';
import { describeCostTakenBack } from '@apps/runway/utils/changeText';
import { undoTransfer } from '@apps/runway/store/actions/transferActions';
import type { ChangeMove } from '@apps/runway/types';

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** A purchase-made mark as the purchase reads now, so an edited purchase's Take back says what it came to today; the sealed log line stays as written. */
export function useLiveCostMove() {
  const purchases = useAppSelector(selectSpendPurchases);
  const costFromFree = useAppSelector(
    (state) => selectBalances(state).costFromFreeByItem,
  );
  return <T extends Omit<ChangeMove, 'isUndo'>>(moved: T): T => {
    const { cost } = moved;
    if (!cost || cost.mark !== 'purchase') return moved;
    const live = getPurchaseMarkFigures(
      cost,
      purchases.find(({ id }) => id === cost.purchaseId) ?? null,
      costFromFree[cost.itemId] ?? 0,
    );
    return {
      ...moved,
      cost: live,
      undoText: describeCostTakenBack(
        live.name,
        live.itemName,
        live.dueOn,
        live.amountCents,
        live.fromFreeCents,
        live.mark,
      ),
    };
  };
}

/** Takes one move of money, or one payment marked paid, back and toasts the outcome; resolves true when it was undone. */
export function useUndoTransfer() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const toLive = useLiveCostMove();
  return async (stored: Omit<ChangeMove, 'isUndo'>) => {
    const moved = toLive(stored);
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
      } else if (moved.cost) {
        const { cost } = moved;
        const isWritten = await undoCostPayment(
          user.uid,
          cost.itemId,
          { item: cost.itemName, cost: cost.name },
          { ...cost, moveId: moved.moveId },
        );
        if (!isWritten) {
          addToast({
            title: COST_PAID_WORDS.alreadyTakenBack(cost.name),
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
