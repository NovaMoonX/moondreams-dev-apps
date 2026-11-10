import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
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
  selectRouteMemories,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase, PurchasePairKind } from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { getPairSideName } from '@apps/runway/utils/purchaseText';

interface PairOfferProps {
  purchase: OpenPurchase;
  onDone: () => void;
  /** What to ask instead (the envelope or the pay), shown at once when nothing is offered and otherwise behind the row that says it is not a move or card payment. */
  children: ReactNode;
  /** The row's subtitle: what the other question picks. */
  elseSubtitle: string;
}

/** The purchases a waiting one may be the other side of as a move between the person's own accounts: tapping one pairs them, and neither counts as spending or income. While any are offered it is the only question; the usual one waits behind a quiet row. */
function PairOffer({
  purchase,
  onDone,
  children,
  elseSubtitle,
}: PairOfferProps) {
  const { user } = useAuth();
  const waitingList = useAppSelector((state) => state.runway.needsHome);
  const lost = useAppSelector(selectLostPairs);
  const routes = useAppSelector(selectRouteMemories);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const cards = useAppSelector(selectAllCards);
  const pairAccounts = usePairAccountsWithUndo();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isElse, setIsElse] = useState(false);

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
  const offered = (
    findAccountPairs(waiting, true, routes).offers.get(purchase.id) ?? []
  )
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

  if (!self || offered.length === 0 || isElse) return <>{children}</>;
  const isCardOffer = offered.every(({ kind }) => kind === 'cardPayment');
  const selfName = getPairSideName(self, accounts, cardNameOf);
  const otherNames = Array.from(
    new Set(
      offered.map(({ other }) => getPairSideName(other, accounts, cardNameOf)),
    ),
  );
  const otherName = otherNames.length === 1 ? otherNames[0] : null;
  const title = !isCardOffer
    ? PAIR_WORDS.whichTitle
    : isOut
      ? PAIR_WORDS.cardWhichTitle(otherName, selfName)
      : PAIR_WORDS.cardWhichTitle(selfName, otherName);
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{title}</p>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {offered.map(({ other, kind, name }) => {
          const detail = `${PAIR_WORDS.pairVerb} · ${formatDateOrdinalUTC(other.date)}`;
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
      <ActionRow
        icon={<X />}
        label={isCardOffer ? PAIR_WORDS.notCardPayment : PAIR_WORDS.unpair}
        subtitle={elseSubtitle}
        onClick={() => setIsElse(true)}
      />
    </div>
  );
}

export default PairOffer;
