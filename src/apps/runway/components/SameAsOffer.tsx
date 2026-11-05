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
import { selectItemLooks } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

interface SameAsOfferProps {
  purchase: OpenPurchase;
  onDone: () => void;
}

/** The purchases typed by hand that a waiting bank charge may be, when none is clearly it: tapping one makes them one purchase, and "None of these" stops offering them. */
function SameAsOffer({ purchase, onDone }: SameAsOfferProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const looks = useAppSelector(selectItemLooks);
  const merge = useMergeWithUndo();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const offered = (
    findPurchaseMatches(waiting, purchases).offers.get(purchase.id) ?? []
  ).flatMap((id) => purchases.filter((entry) => entry.id === id));

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
      <div>
        <p className='text-sm font-medium'>{NEEDS_HOME_WORDS.sameTitle}</p>
        <p className='text-muted-foreground text-xs'>
          {NEEDS_HOME_WORDS.sameHint}
        </p>
      </div>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {offered.map((typed) => {
          const name = getPurchaseTitle(typed, nameOf);
          const difference = purchase.amountCents - typed.amountCents;
          const detail = `${formatDateOrdinalUTC(typed.date)} · ${NEEDS_HOME_WORDS.sameRow(
            difference === 0
              ? null
              : `${formatCents(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'}`,
          )}`;
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

export default SameAsOffer;
