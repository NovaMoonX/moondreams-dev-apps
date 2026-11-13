import { useState } from 'react';
import { CircleCheck, Wallet } from 'lucide-react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  assignPurchase,
  returnPurchaseToWaiting,
} from '@apps/runway/store/actions/purchaseActions';
import type { OpenPurchase } from '@apps/runway/types';
import {
  describePurchaseAssigned,
  describePurchaseKeptFree,
  describePurchaseReturned,
} from '@apps/runway/utils/purchaseText';
import { UNDO_WINDOW_MS } from '@/lib/undo';

const getWords = (purchase: OpenPurchase, isKeepFree: boolean) => {
  if (isKeepFree) {
    return {
      label: NEEDS_HOME_WORDS.keepFree,
      subtitle: NEEDS_HOME_WORDS.keepFreeSub,
      done: NEEDS_HOME_WORDS.keptFree,
    };
  }
  return purchase.amountCents > 0
    ? {
        label: NEEDS_HOME_WORDS.unseenOut,
        subtitle: NEEDS_HOME_WORDS.unseenOutSub,
        done: NEEDS_HOME_WORDS.savedMove,
      }
    : {
        label: NEEDS_HOME_WORDS.notPay,
        subtitle: NEEDS_HOME_WORDS.notPaySub,
        done: NEEDS_HOME_WORDS.savedIn,
      };
};

interface LeaveOutRowProps {
  purchase: OpenPurchase;
  onDone: () => void;
  /** Keeps a charge counted in Free to Spend with no envelope, instead of marking it as no spending or income. */
  isKeepFree?: boolean;
  /** The row's own words where the usual ones would not fit the question asked. */
  label?: string;
  subtitle?: string;
}

/** Settles a waiting purchase as neither spending nor income (money in that is not a pay, a move to or from an account Runway doesn't see), or keeps a charge in Free to Spend. At Link the balance already counts either, so only Spend and income change; a failure reads in the row's own subtitle. */
function LeaveOutRow({
  purchase,
  onDone,
  isKeepFree = false,
  label,
  subtitle,
}: LeaveOutRowProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = getWords(purchase, isKeepFree);

  const leaveOut = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const uid = user.uid;
      const lines = isKeepFree
        ? [
            {
              envelopeId: null,
              cents: purchase.amountCents,
              via: 'free' as const,
            },
          ]
        : [];
      const updatedAt = await assignPurchase(
        uid,
        await getRunwayEncryption(uid),
        purchase,
        lines,
        isKeepFree
          ? describePurchaseKeptFree(purchase, () => '')
          : describePurchaseAssigned(purchase, [], () => ''),
      );
      const leftOut = {
        ...purchase,
        lines,
        needsHome: false,
        incomeDayId: null,
        pairedWithId: null,
        pairKind: null,
        cardPaymentMoveId: null,
        tickedDayKey: null,
        updatedAt,
      };
      addToast({
        title: words.done,
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: NEEDS_HOME_WORDS.undo,
          onClick: () =>
            void getRunwayEncryption(uid)
              .then((encryption) =>
                returnPurchaseToWaiting(
                  uid,
                  encryption,
                  leftOut,
                  describePurchaseReturned(leftOut, () => ''),
                  { ruleId: null, assignedBy: 'person' },
                ),
              )
              .catch((undoError: unknown) =>
                addToast({
                  title: NEEDS_HOME_WORDS.undoFailed,
                  description: getErrorMessage(undoError, ''),
                  type: 'error',
                }),
              ),
        },
      });
      onDone();
    } catch (leaveError) {
      setError(getErrorMessage(leaveError, NEEDS_HOME_WORDS.failed));
      setIsBusy(false);
    }
  };

  return (
    <ActionRow
      isGrouped
      isRoomy
      icon={isKeepFree ? <Wallet /> : <CircleCheck />}
      label={label ?? words.label}
      subtitle={error ?? subtitle ?? words.subtitle}
      isDisabled={isBusy}
      onClick={() => void leaveOut()}
    />
  );
}

export default LeaveOutRow;
