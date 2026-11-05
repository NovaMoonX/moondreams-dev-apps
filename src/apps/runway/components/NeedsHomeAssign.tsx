import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ItemRow from '@apps/runway/components/ItemRow';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { NEEDS_HOME_WORDS, SPEND_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { findPlacementRun, toMerchantKey } from '@apps/runway/engine/rules';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  assignPurchase,
  readPurchaseNow,
  returnPurchaseToWaiting,
} from '@apps/runway/store/actions/purchaseActions';
import {
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getSpilledLines } from '@apps/runway/store/selectors/spillSelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { rankLikelyEnvelopes } from '@apps/runway/utils/likelyEnvelopes';
import { isRuleDeclined } from '@apps/runway/utils/ruleDeclined';
import {
  describePurchaseAssigned,
  describePurchaseReturned,
} from '@apps/runway/utils/purchaseText';

const LIKELY_SHOWN = 3;

interface NeedsHomeAssignProps {
  purchase: OpenPurchase;
  onDone: () => void;
  /** Called with the purchase as sent when the sheet should stay open to offer a rule for it (the third time in a row); then `onDone` is not called. */
  onSuggestRule?: (placed: OpenPurchase) => void;
}

/** The likeliest envelopes for a waiting purchase, each one tap away; anything else goes through the purchase's own edit. */
function NeedsHomeAssign({
  purchase,
  onDone,
  onSuggestRule,
}: NeedsHomeAssignProps) {
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
        { ruleId: null, assignedBy: 'person' },
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
    const lines = getSpilledLines(
      store.getState(),
      [{ envelopeId, cents: purchase.amountCents, via: 'chosen' }],
      null,
      purchase.date,
    );
    try {
      const updatedAt = await assignPurchase(
        user.uid,
        await getRunwayEncryption(user.uid),
        purchase,
        lines,
        describePurchaseAssigned(purchase, lines, nameOf),
      );
      const placed = { ...purchase, lines, needsHome: false, updatedAt };
      addToast({
        title: NEEDS_HOME_WORDS.sentTo(nameOf(envelopeId)),
        type: 'success',
        action: {
          label: NEEDS_HOME_WORDS.undo,
          onClick: () => void putBack(user.uid, placed),
        },
      });
      const run = findPlacementRun(
        toMerchantKey(purchase.merchant),
        [...history.filter((entry) => entry.id !== purchase.id), placed],
        store.getState().runway.rules,
      );
      const merchantKey = toMerchantKey(purchase.merchant);
      if (
        onSuggestRule &&
        run?.envelopeId === envelopeId &&
        merchantKey !== null &&
        !isRuleDeclined(user.uid, merchantKey)
      ) {
        onSuggestRule(placed);
      } else {
        onDone();
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : '';
      if (
        message === SPEND_WORDS.changedElsewhere ||
        message === SPEND_WORDS.notFound
      ) {
        const fresh = await getRunwayEncryption(user.uid)
          .then((encryption) =>
            readPurchaseNow(user.uid, encryption, purchase.id),
          )
          .catch(() => null);
        const home = fresh?.lines.find((line) => line.via === 'chosen');
        if (
          fresh &&
          !fresh.needsHome &&
          fresh.ruleId !== null &&
          home?.envelopeId
        ) {
          addToast({
            title: NEEDS_HOME_WORDS.alreadySent(nameOf(home.envelopeId)),
            type: 'success',
            action: {
              label: NEEDS_HOME_WORDS.undo,
              onClick: () => void putBack(user.uid, fresh),
            },
          });
          onDone();
          return;
        }
      }
      setError(getErrorMessage(sendError, NEEDS_HOME_WORDS.failed));
      setBusyId(null);
    }
  };

  if (likely.length === 0) return null;
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{NEEDS_HOME_WORDS.whichTitle}</p>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {likely.map((id) => (
          <ItemRow
            key={id}
            name={nameOf(id)}
            emoji={looks.get(id)?.emoji ?? null}
            detail={NEEDS_HOME_WORDS.sendHere}
            isPrivate={false}
            ariaLabel={`${nameOf(id)}, ${NEEDS_HOME_WORDS.sendHere}`}
            isAction
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
