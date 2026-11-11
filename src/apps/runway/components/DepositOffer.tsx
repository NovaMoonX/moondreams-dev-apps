import { useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
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
  selectLostPairs,
  selectLinkWaiting,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';

interface DepositOfferProps {
  deposit: OpenPurchase;
  onDone: () => void;
}

/** The pay days a waiting deposit may be, when none is clearly it: tapping one links the deposit to that day. Draws nothing when no pay day is close. */
function DepositOffer({ deposit, onDone }: DepositOfferProps) {
  const { user } = useAuth();
  const { isHidden } = useValuesHidden();
  const today = todayAsUtcDate();
  const waitingList = useAppSelector(selectLinkWaiting);
  const lost = useAppSelector((state) => selectLostDeposits(state, today));
  const lostPairs = useAppSelector(selectLostPairs);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const days = useAppSelector((state) => selectDepositDays(state, today));
  const listed = useAppSelector((state) => selectListedDays(state, today));
  const link = useLinkDepositsWithUndo();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waiting = [
    ...waitingList,
    ...lost.map((entry) => ({ ...entry, needsHome: true, incomeDayId: null })),
    ...lostPairs.map((entry) => ({
      ...entry,
      needsHome: true,
      pairedWithId: null,
      pairKind: null,
    })),
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
      const payLineId = days.find(
        (entry) => entry.dayKey === dayKey,
      )?.payLineId;
      await link(
        user.uid,
        [{ deposit, dayKey, dayOn, payLineId }],
        'person',
        true,
      );
      onDone();
    } catch (pickError) {
      setError(getErrorMessage(pickError, NEEDS_HOME_WORDS.failed));
      setBusyKey(null);
    }
  };

  if (offered.length === 0) return null;
  const received = -deposit.amountCents;
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{DEPOSIT_WORDS.whichTitle}</p>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {offered.map(({ day, named }) => {
            const { lowCents, highCents } = day.amount;
            const difference = received - lowCents;
            const fit = isHidden
              ? null
              : lowCents !== highCents
                ? received >= lowCents && received <= highCents
                  ? DEPOSIT_WORDS.inRange
                  : null
                : difference === 0
                  ? DEPOSIT_WORDS.dayRow(null)
                  : difference > 0
                    ? DEPOSIT_WORDS.moreThan(formatCents(difference))
                    : DEPOSIT_WORDS.lessThan(formatCents(-difference));
            const name = named.sourceName ?? named.payLineName;
            const detail = [
              named.sourceName ? named.payLineName : null,
              formatDateOrdinalUTC(day.arrivedOn ?? day.expectedOn),
              fit,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <ItemRow
                key={day.dayKey}
                name={name}
                detail={detail}
                figure={
                  lowCents === highCents
                    ? formatCents(lowCents)
                    : `${formatCentsShort(lowCents)}–${formatCentsShort(highCents)}`
                }
                ariaLabel={`${name}, ${detail}`}
                isAction
                onOpen={() => void pick(day.dayKey, day.expectedOn)}
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

export default DepositOffer;
