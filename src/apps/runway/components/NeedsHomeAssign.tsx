import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { assignPurchase } from '@apps/runway/store/actions/purchaseActions';
import {
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { rankLikelyEnvelopes } from '@apps/runway/utils/likelyEnvelopes';
import { describePurchaseAssigned } from '@apps/runway/utils/purchaseText';

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

  const send = async (envelopeId: string) => {
    if (!user || busyId !== null) return;
    setBusyId(envelopeId);
    setError(null);
    const lines = [
      { envelopeId, cents: purchase.amountCents, via: 'chosen' as const },
    ];
    try {
      await assignPurchase(
        user.uid,
        await getRunwayEncryption(user.uid),
        purchase,
        lines,
        describePurchaseAssigned(purchase, lines, nameOf),
      );
      addToast({
        title: NEEDS_HOME_WORDS.sentTo(nameOf(envelopeId)),
        type: 'success',
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
      <p className='text-muted-foreground text-sm'>
        {NEEDS_HOME_WORDS.whereTitle}
      </p>
      <ActionGroup>
        {likely.map((id) => (
          <ActionRow
            key={id}
            isGrouped
            icon={looks.get(id)?.emoji ?? nameOf(id).slice(0, 1)}
            label={nameOf(id)}
            isDisabled={busyId !== null}
            onClick={() => void send(id)}
          />
        ))}
      </ActionGroup>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default NeedsHomeAssign;
