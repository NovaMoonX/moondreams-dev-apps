import { useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import { NEEDS_HOME_WORDS, PAIR_WORDS } from '@apps/runway/constants';
import { findAccountPairs } from '@apps/runway/engine/matching';
import { usePairAccountsWithUndo } from '@apps/runway/hooks/useBankMatch';
import {
  selectAllCards,
  selectLostPairs,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase, PurchasePairKind } from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { getPairSideName } from '@apps/runway/utils/purchaseText';

interface PairOfferProps {
  purchase: OpenPurchase;
  onDone: () => void;
}

/** The purchases a waiting one may be the other side of as a move between the person's own accounts: tapping one pairs them, and neither counts as spending or income. */
function PairOffer({ purchase, onDone }: PairOfferProps) {
  const { user } = useAuth();
  const waitingList = useAppSelector((state) => state.runway.needsHome);
  const lost = useAppSelector(selectLostPairs);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const cards = useAppSelector(selectAllCards);
  const pairAccounts = usePairAccountsWithUndo();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waiting = [
    ...waitingList,
    ...lost
      .filter((entry) => !waitingList.some((other) => other.id === entry.id))
      .map((entry) => ({
        ...entry,
        needsHome: true,
        pairedWithId: null,
        pairKind: null,
      })),
  ];
  const self = waiting.find((entry) => entry.id === purchase.id);
  const cardNameOf = getCardNamer(cards);
  const isOut = purchase.amountCents > 0;
  const offered = (findAccountPairs(waiting).offers.get(purchase.id) ?? [])
    .flatMap(({ otherId, kind }) => {
      const other = waiting.find((entry) => entry.id === otherId);
      return other ? [{ other, kind }] : [];
    })
    .map(({ other, kind }) => {
      const otherName = getPairSideName(other, accounts, cardNameOf);
      const name =
        kind !== 'cardPayment'
          ? otherName
          : isOut
            ? PAIR_WORDS.cardPaymentTo(otherName)
            : PAIR_WORDS.cardPaymentFrom(otherName);
      return { other, kind, name };
    });

  const pick = async (other: OpenPurchase, kind: PurchasePairKind) => {
    if (!user || !self || busyId !== null) return;
    setBusyId(other.id);
    setError(null);
    try {
      await pairAccounts(
        user.uid,
        [
          isOut
            ? { out: self, into: other, kind }
            : { out: other, into: self, kind },
        ],
        'person',
        true,
      );
      onDone();
    } catch (pickError) {
      setError(getErrorMessage(pickError, NEEDS_HOME_WORDS.failed));
      setBusyId(null);
    }
  };

  if (!self || offered.length === 0) return null;
  return (
    <div className='space-y-2'>
      <div>
        <p className='text-sm font-medium'>{PAIR_WORDS.whichTitle}</p>
        <p className='text-muted-foreground text-xs'>{PAIR_WORDS.whichHint}</p>
      </div>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {offered.map(({ other, kind, name }) => {
          const detail = formatDateOrdinalUTC(other.date);
          return (
            <ItemRow
              key={other.id}
              name={name}
              detail={detail}
              figure={formatCents(Math.abs(other.amountCents))}
              ariaLabel={`${name}, ${detail}`}
              isAction
              onOpen={() => void pick(other, kind)}
            />
          );
        })}
      </ul>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default PairOffer;
