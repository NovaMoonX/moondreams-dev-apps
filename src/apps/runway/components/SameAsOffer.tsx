import { useState } from 'react';
import { X } from 'lucide-react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { findPurchaseMatches } from '@apps/runway/engine/matching';
import { useMergeWithUndo } from '@apps/runway/hooks/useBankMatch';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { markNotSamePurchase } from '@apps/runway/store/actions/purchaseActions';
import {
  selectHistoryDuplicates,
  selectHistoryPurchases,
  selectItemLooks,
  selectLinkWaiting,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

interface SameAsChoicesProps {
  purchase: OpenPurchase;
  offered: readonly OpenPurchase[];
  title: string;
  toRow: (entry: OpenPurchase) => { name: string; detail: string };
  onDone: () => void;
}

/** The purchases a bank charge may be, when none is clearly it: tapping one makes them one purchase (with an Undo), and "None of these" stops offering them. */
export function SameAsChoices({
  purchase,
  offered,
  title,
  toRow,
  onDone,
}: SameAsChoicesProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const merge = useMergeWithUndo();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (typed: OpenPurchase) => {
    if (!user || busyId !== null) return;
    setBusyId(typed.id);
    setError(null);
    try {
      await merge(user.uid, [{ bank: purchase, typed }], true);
      onDone();
    } catch (pickError) {
      setError(getErrorMessage(pickError, NEEDS_HOME_WORDS.failed));
      setBusyId(null);
    }
  };

  const decline = async () => {
    if (!user || busyId !== null) return;
    setBusyId('none');
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await Promise.all(
        offered.map((typed) =>
          markNotSamePurchase(user.uid, encryption, typed, [purchase.id]),
        ),
      );
      addToast({ title: NEEDS_HOME_WORDS.notSameDone, type: 'success' });
    } catch (declineError) {
      setError(getErrorMessage(declineError, NEEDS_HOME_WORDS.failed));
    }
    setBusyId(null);
  };

  if (offered.length === 0) return null;
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{title}</p>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {offered.map((typed) => {
          const { name, detail } = toRow(typed);
          return (
            <ItemRow
              key={typed.id}
              name={name}
              detail={detail}
              figure={formatCents(typed.amountCents)}
              ariaLabel={`${name}, ${detail}`}
              isAction
              onOpen={() => void pick(typed)}
            />
          );
        })}
        <ItemRow
          leading={
            <span
              className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
              aria-hidden='true'
            >
              <X className='h-5 w-5' />
            </span>
          }
          name={NEEDS_HOME_WORDS.notSame}
          detail={NEEDS_HOME_WORDS.notSameSub}
          isPrivate={false}
          ariaLabel={`${NEEDS_HOME_WORDS.notSame}, ${NEEDS_HOME_WORDS.notSameSub}`}
          isAction
          onOpen={() => void decline()}
        />
      </ul>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

interface SameAsOfferProps {
  purchase: OpenPurchase;
  onDone: () => void;
}

/** The purchases typed by hand that a waiting bank charge (or a history one the person placed) may be. */
function SameAsOffer({ purchase, onDone }: SameAsOfferProps) {
  const waiting = useAppSelector(selectLinkWaiting);
  const windowPurchases = useAppSelector((state) => state.runway.purchases);
  const purchases = useAppSelector(selectHistoryPurchases);
  const historyOffers = useAppSelector(
    (state) => selectHistoryDuplicates(state).offers,
  );
  const looks = useAppSelector(selectItemLooks);

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const offeredIds =
    findPurchaseMatches(waiting, windowPurchases).offers.get(purchase.id) ??
    historyOffers.get(purchase.id) ??
    [];
  const offered = offeredIds.flatMap((id) =>
    purchases.filter((entry) => entry.id === id),
  );
  const toRow = (typed: OpenPurchase) => {
    const difference = purchase.amountCents - typed.amountCents;
    return {
      name: getPurchaseTitle(typed, nameOf),
      detail: `${NEEDS_HOME_WORDS.sameVerb} · ${formatDateOrdinalUTC(typed.date)} · ${NEEDS_HOME_WORDS.sameRow(
        difference === 0
          ? null
          : `${formatCents(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'}`,
      )}`,
    };
  };

  return (
    <SameAsChoices
      purchase={purchase}
      offered={offered}
      title={NEEDS_HOME_WORDS.sameTitle}
      toRow={toRow}
      onDone={onDone}
    />
  );
}

export default SameAsOffer;
