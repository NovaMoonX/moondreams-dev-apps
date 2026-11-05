import { useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import { DEPOSIT_WORDS, NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { findDepositDays } from '@apps/runway/engine/matching';
import { useLinkDepositsWithUndo } from '@apps/runway/hooks/useBankMatch';
import {
  selectDepositDays,
  selectListedDays,
  selectLostDeposits,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';

interface DepositOfferProps {
  deposit: OpenPurchase;
  onDone: () => void;
}

/** The pay days a waiting deposit may be, when none is clearly it: tapping one links the deposit to that day. */
function DepositOffer({ deposit, onDone }: DepositOfferProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const waitingList = useAppSelector((state) => state.runway.needsHome);
  const lost = useAppSelector((state) => selectLostDeposits(state, today));
  const purchases = useAppSelector((state) => state.runway.purchases);
  const days = useAppSelector((state) => selectDepositDays(state, today));
  const listed = useAppSelector((state) => selectListedDays(state, today));
  const link = useLinkDepositsWithUndo();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waiting = [
    ...waitingList,
    ...lost.map((entry) => ({ ...entry, needsHome: true, incomeDayId: null })),
  ];
  const offered = (
    findDepositDays(waiting, days, purchases).offers.get(deposit.id) ?? []
  ).flatMap((dayKey) => {
    const day = days.find((entry) => entry.dayKey === dayKey);
    const named = [...listed.open, ...listed.confirmed].find(
      (entry) => entry.dayKey === dayKey,
    );
    return day && named ? [{ day, named }] : [];
  });

  const pick = async (dayKey: string, dayOn: number) => {
    if (!user || busyKey !== null) return;
    setBusyKey(dayKey);
    setError(null);
    try {
      await link(user.uid, [{ deposit, dayKey, dayOn }], 'person', true);
      onDone();
    } catch (pickError) {
      setError(getErrorMessage(pickError, NEEDS_HOME_WORDS.failed));
      setBusyKey(null);
    }
  };

  const received = -deposit.amountCents;
  return (
    <div className='space-y-2'>
      <div>
        <p className='text-sm font-medium'>{DEPOSIT_WORDS.whichTitle}</p>
        <p className='text-muted-foreground text-xs'>
          {offered.length > 0
            ? DEPOSIT_WORDS.whichHint
            : DEPOSIT_WORDS.noneNear}
        </p>
      </div>
      {offered.length > 0 && (
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {offered.map(({ day, named }) => {
            const { lowCents, highCents } = day.amount;
            const difference = received - lowCents;
            const detail = [
              formatDateOrdinalUTC(day.arrivedOn ?? day.expectedOn),
              lowCents !== highCents
                ? null
                : difference === 0
                  ? DEPOSIT_WORDS.dayRow(null)
                  : difference > 0
                    ? DEPOSIT_WORDS.moreThan(formatCents(difference))
                    : DEPOSIT_WORDS.lessThan(formatCents(-difference)),
            ]
              .filter(Boolean)
              .join(' · ');
            const name = named.sourceName ?? named.payLineName;
            return (
              <ItemRow
                key={day.dayKey}
                name={name}
                detail={detail}
                figure={
                  lowCents === highCents
                    ? formatCents(lowCents)
                    : `${formatCentsShort(lowCents)} to ${formatCentsShort(highCents)}`
                }
                ariaLabel={`${name}, ${detail}`}
                isAction
                onOpen={() => void pick(day.dayKey, day.expectedOn)}
              />
            );
          })}
        </ul>
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default DepositOffer;
