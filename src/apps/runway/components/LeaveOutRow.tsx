import { useState } from 'react';
import { Ban, Wallet } from 'lucide-react';

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

const getSubtitle = (purchase: OpenPurchase, isKeepFree: boolean) => {
  if (isKeepFree) return NEEDS_HOME_WORDS.keepFreeSub;
  return purchase.amountCents > 0
    ? NEEDS_HOME_WORDS.leaveOutSub
    : NEEDS_HOME_WORDS.leaveOutMoneyInSub;
};

interface LeaveOutRowProps {
  purchase: OpenPurchase;
  onDone: () => void;
  /** Keeps a charge counted in Free to Spend with no envelope, instead of taking it out of spending. */
  isKeepFree?: boolean;
  /** The row's own words where the usual ones would not fit the question asked. */
  label?: string;
  subtitle?: string;
}

/** Takes a waiting purchase out of spending, whether it is money in or a charge, or keeps a charge in Free to Spend; a failure reads in the row's own subtitle. */
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
        title: isKeepFree
          ? NEEDS_HOME_WORDS.keptFree
          : NEEDS_HOME_WORDS.leftOut,
        type: 'success',
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
      icon={isKeepFree ? <Wallet /> : <Ban />}
      label={
        label ??
        (isKeepFree ? NEEDS_HOME_WORDS.keepFree : NEEDS_HOME_WORDS.leaveOut)
      }
      subtitle={error ?? subtitle ?? getSubtitle(purchase, isKeepFree)}
      isDisabled={isBusy}
      onClick={() => void leaveOut()}
    />
  );
}

export default LeaveOutRow;
