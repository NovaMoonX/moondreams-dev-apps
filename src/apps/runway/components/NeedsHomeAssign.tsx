import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ItemRow from '@apps/runway/components/ItemRow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  assignPurchase,
  returnPurchaseToWaiting,
} from '@apps/runway/store/actions/purchaseActions';
import {
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { rankLikelyEnvelopes } from '@apps/runway/utils/likelyEnvelopes';
import {
  describePurchaseAssigned,
  describePurchaseReturned,
} from '@apps/runway/utils/purchaseText';

const LIKELY_SHOWN = 3;

interface NeedsHomeAssignProps {
  purchase: OpenPurchase;
  onDone: () => void;
}

/** The likeliest envelopes for a waiting purchase, each one tap away; anything else goes through the purchase's own edit. */
function NeedsHomeAssign({ purchase, onDone }: NeedsHomeAssignProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const history = useAppSelector((state) => state.runway.purchases);
  const looks = useAppSelector(selectItemLooks);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const likely = rankLikelyEnvelopes(
    purchase.merchant,
    history,
    envelopes.map(({ item }) => item.id),
    LIKELY_SHOWN,
  );

  const putBack = async (uid: string, sent: OpenPurchase) => {
    try {
      await returnPurchaseToWaiting(
        uid,
        await getRunwayEncryption(uid),
        sent,
        describePurchaseReturned(sent, nameOf),
      );
    } catch (undoError) {
      addToast({
        title: NEEDS_HOME_WORDS.undoFailed,
        description: getErrorMessage(undoError, ''),
        type: 'error',
      });
    }
  };

  const send = async (envelopeId: string) => {
    if (!user || busyId !== null) return;
    setBusyId(envelopeId);
    setError(null);
    const lines = [
      { envelopeId, cents: purchase.amountCents, via: 'chosen' as const },
    ];
    try {
      const updatedAt = await assignPurchase(
        user.uid,
        await getRunwayEncryption(user.uid),
        purchase,
        lines,
        describePurchaseAssigned(purchase, lines, nameOf),
      );
      addToast({
        title: NEEDS_HOME_WORDS.sentTo(nameOf(envelopeId)),
        type: 'success',
        action: {
          label: NEEDS_HOME_WORDS.undo,
          onClick: () =>
            void putBack(user.uid, {
              ...purchase,
              lines,
              needsHome: false,
              updatedAt,
            }),
        },
      });
      onDone();
    } catch (sendError) {
      setError(getErrorMessage(sendError, NEEDS_HOME_WORDS.failed));
      setBusyId(null);
    }
  };

  if (likely.length === 0) return null;
  return (
    <div className='space-y-2'>
      <div>
        <p className='text-sm font-medium'>{NEEDS_HOME_WORDS.whichTitle}</p>
        <p className='text-muted-foreground text-xs'>
          {NEEDS_HOME_WORDS.likelyHint(purchase.merchant?.trim() ?? '')}
        </p>
      </div>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {likely.map((id) => (
          <ItemRow
            key={id}
            name={nameOf(id)}
            emoji={looks.get(id)?.emoji ?? null}
            detail={NEEDS_HOME_WORDS.sendHere}
            isPrivate={false}
            ariaLabel={`${nameOf(id)}, ${NEEDS_HOME_WORDS.sendHere}`}
            onOpen={() => void send(id)}
          />
        ))}
      </ul>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default NeedsHomeAssign;
