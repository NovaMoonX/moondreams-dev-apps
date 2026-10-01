import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, ChevronRight, Circle } from 'lucide-react';

import {
  isPairSettled,
  type DirectionalOwed,
  type PairSettlement,
} from '@apps/waypoint/utils/splitCalculators';

const EPSILON = 0.005;

interface DuesSummaryProps {
  settlements: PairSettlement[];
  currentUserId: string;
  memberLabel: (uid: string) => string;
  formatAmount: (amount: number) => string;
  onToggleRepaid: (expenseId: string) => void;
}

const getPairKey = (settlement: PairSettlement) => `${settlement.personA}-${settlement.personB}`;

function DuesSummary({
  settlements,
  currentUserId,
  memberLabel,
  formatAmount,
  onToggleRepaid,
}: DuesSummaryProps) {
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
  const selectedSettlement = settlements.find((settlement) => getPairKey(settlement) === selectedPairKey);

  const getDirection = ({ personA, personB, netAmount }: PairSettlement) =>
    netAmount >= 0 ? { debtorUid: personA, creditorUid: personB } : { debtorUid: personB, creditorUid: personA };

  const renderStat = (label: string, value: string, emphasized = false) => (
    <div>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className={join('text-sm', emphasized ? 'font-semibold' : 'font-medium')}>{value}</p>
    </div>
  );

  const renderItem = (
    { expense, share, isRepaid }: DirectionalOwed['items'][number],
    canToggle: boolean,
  ) => {
    const content = (
      <>
        <span className='flex min-w-0 flex-1 items-center gap-2 text-left'>
          {isRepaid ? (
            <Check className='h-4 w-4 shrink-0 text-emerald-600' />
          ) : (
            <Circle className='text-muted-foreground h-4 w-4 shrink-0' />
          )}
          <span className='truncate'>{expense.title}</span>
        </span>
        <span className='shrink-0 tabular-nums'>{formatAmount(share)}</span>
      </>
    );
    const rowClassName = join('text-sm', isRepaid && 'text-muted-foreground');

    return (
      <li key={expense.id}>
        {canToggle ? (
          <Button
            type='button'
            variant='tertiary'
            aria-label={`${isRepaid ? 'Mark not repaid' : 'Mark repaid'}: ${expense.title}`}
            onClick={() => onToggleRepaid(expense.id)}
            className={join(
              'h-auto w-full justify-start gap-3 rounded-md px-2 py-2 focus:outline-transparent!',
              rowClassName,
            )}
          >
            {content}
          </Button>
        ) : (
          <div className={join('flex items-center justify-between gap-3 px-2 py-2', rowClassName)}>
            {content}
          </div>
        )}
      </li>
    );
  };

  const renderDirection = (
    fromUid: string,
    toUid: string,
    owed: DirectionalOwed,
    showTotals: boolean,
  ) => {
    if (owed.total <= EPSILON) {
      return null;
    }

    const canToggle = fromUid === currentUserId;

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
        <ul className='-mx-2'>{owed.items.map((item) => renderItem(item, canToggle))}</ul>
        {canToggle && (
          <p className='text-muted-foreground text-xs'>Tap an item once you&apos;ve paid it back.</p>
        )}
      </div>
    );
  };

  const renderBreakdown = (settlement: PairSettlement) => {
    const { personA, personB, netAmount, aOwesB, bOwesA } = settlement;
    const showTotals =
      (aOwesB.total > EPSILON && bOwesA.total > EPSILON) ||
      aOwesB.repaid > EPSILON ||
      bOwesA.repaid > EPSILON;
    const { debtorUid, creditorUid } = getDirection(settlement);

    return (
      <div className='space-y-4'>
        <div className='flex items-baseline justify-between gap-3'>
          <p className='min-w-0 text-sm font-medium'>
            {isPairSettled(settlement)
              ? `${memberLabel(personA)} and ${memberLabel(personB)} are settled up`
              : `${memberLabel(debtorUid)} owes ${memberLabel(creditorUid)}`}
          </p>
          {!isPairSettled(settlement) && (
            <p className='shrink-0 text-base font-semibold tabular-nums'>
              {formatAmount(Math.abs(netAmount))}
              <span className='text-muted-foreground ml-1 text-xs font-normal'>net</span>
            </p>
          )}
        </div>
        {renderDirection(personA, personB, aOwesB, showTotals)}
        {renderDirection(personB, personA, bOwesA, showTotals)}
      </div>
    );
  };

  return (
    <>
      <ul className='divide-border -mx-3 mt-1 divide-y'>
        {settlements.map((settlement) => {
          const { personA, personB, netAmount } = settlement;
          const settled = isPairSettled(settlement);
          const { debtorUid, creditorUid } = getDirection(settlement);

          return (
            <li key={getPairKey(settlement)}>
              <Button
                type='button'
                variant='tertiary'
                onClick={() => setSelectedPairKey(getPairKey(settlement))}
                className='h-auto w-full justify-start gap-3 rounded-none px-3 py-3 text-left focus:outline-transparent!'
              >
                <span className={join('min-w-0 flex-1 text-sm', settled ? 'text-muted-foreground' : 'font-medium')}>
                  {settled
                    ? `${memberLabel(personA)} and ${memberLabel(personB)} are settled up`
                    : `${memberLabel(debtorUid)} owes ${memberLabel(creditorUid)}`}
                </span>
                <span className='flex shrink-0 items-center gap-1'>
                  {!settled && (
                    <span className='text-sm font-semibold tabular-nums'>
                      {formatAmount(Math.abs(netAmount))}
                    </span>
                  )}
                  <ChevronRight className='text-muted-foreground h-4 w-4' />
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      <Modal
        isOpen={selectedSettlement !== undefined}
        onClose={() => setSelectedPairKey(null)}
        title='Dues'
      >
        {selectedSettlement && renderBreakdown(selectedSettlement)}
      </Modal>
    </>
  );
}

export default DuesSummary;
