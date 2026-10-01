import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, Circle } from 'lucide-react';

import {
  isPairSettled,
  type DirectionalOwed,
  type PairSettlement,
} from '@apps/waypoint/utils/splitCalculators';

const EPSILON = 0.005;

interface DuesSummaryProps {
  settlements: PairSettlement[];
  memberLabel: (uid: string) => string;
  formatAmount: (amount: number) => string;
}

function DuesSummary({ settlements, memberLabel, formatAmount }: DuesSummaryProps) {
  const renderStat = (label: string, value: string, emphasized = false) => (
    <div>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className={join('text-sm', emphasized ? 'font-semibold' : 'font-medium')}>{value}</p>
    </div>
  );

  const renderDirection = (
    fromUid: string,
    toUid: string,
    owed: DirectionalOwed,
    showTotals: boolean,
  ) => {
    if (owed.total <= EPSILON) {
      return null;
    }

    return (
      <div key={`${fromUid}-${toUid}`} className='space-y-2'>
        {showTotals && (
          <>
            <p className='text-muted-foreground text-xs font-medium'>
              {memberLabel(fromUid)} → {memberLabel(toUid)}
            </p>
            <div className='grid grid-cols-3 gap-2'>
              {renderStat('Total', formatAmount(owed.total))}
              {renderStat('Repaid', formatAmount(owed.repaid))}
              {renderStat('Still owed', formatAmount(owed.remaining), true)}
            </div>
          </>
        )}
        <ul className='space-y-1.5'>
          {owed.items.map(({ expense, share, isRepaid }) => (
            <li
              key={expense.id}
              className={join(
                'flex items-center justify-between gap-3 text-sm',
                isRepaid && 'text-muted-foreground',
              )}
            >
              <span className='flex min-w-0 items-center gap-2'>
                {isRepaid ? (
                  <Check className='h-3.5 w-3.5 shrink-0 text-emerald-600' />
                ) : (
                  <Circle className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                )}
                <span className='truncate'>{expense.title}</span>
              </span>
              <span className='shrink-0 tabular-nums'>{formatAmount(share)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <ul className='divide-border mt-2 divide-y'>
      {settlements.map((settlement) => {
        const { personA, personB, netAmount, aOwesB, bOwesA } = settlement;
        const hasRepaidHistory = aOwesB.repaid > EPSILON || bOwesA.repaid > EPSILON;
        const isCircular = aOwesB.total > EPSILON && bOwesA.total > EPSILON;
        const showTotals = isCircular || hasRepaidHistory;
        const debtorUid = netAmount >= 0 ? personA : personB;
        const creditorUid = netAmount >= 0 ? personB : personA;

        if (isPairSettled(settlement)) {
          return (
            <li key={`${personA}-${personB}`} className='text-muted-foreground py-3 text-sm first:pt-0 last:pb-0'>
              {memberLabel(personA)} and {memberLabel(personB)} are settled up
              {hasRepaidHistory && ' (fully repaid)'}
            </li>
          );
        }

        return (
          <li key={`${personA}-${personB}`} className='space-y-3 py-3 first:pt-0 last:pb-0'>
            <div className='flex items-baseline justify-between gap-3'>
              <p className='min-w-0 text-sm font-medium'>
                {memberLabel(debtorUid)} owes {memberLabel(creditorUid)}
              </p>
              <p className='shrink-0 text-base font-semibold tabular-nums'>
                {formatAmount(Math.abs(netAmount))}
                <span className='text-muted-foreground ml-1 text-xs font-normal'>net</span>
              </p>
            </div>
            <div className='space-y-4'>
              {renderDirection(personA, personB, aOwesB, showTotals)}
              {renderDirection(personB, personA, bOwesA, showTotals)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default DuesSummary;
