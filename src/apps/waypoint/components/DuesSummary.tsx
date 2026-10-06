import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, ChevronRight, Circle, HandCoins } from 'lucide-react';

import {
  isPairSettled,
  type DirectionalOwed,
  type EarlyItem,
  type PairSettlement,
} from '@apps/waypoint/utils/splitCalculators';

const MAX_VISIBLE_NOTICES = 3;
const MAX_VISIBLE_PAIRS = 6;

const EPSILON = 0.005;

interface DuesSummaryProps {
  settlements: PairSettlement[];
  currentUserId: string;
  memberLabel: (uid: string) => string;
  formatAmount: (amount: number) => string;
  onToggleRepaid: (expenseId: string) => void;
  onSetEarlyReturned: (expenseId: string, isReturned: boolean) => void;
}

const getPairKey = (settlement: PairSettlement) => `${settlement.personA}-${settlement.personB}`;

function DuesSummary({
  settlements,
  currentUserId,
  memberLabel,
  formatAmount,
  onToggleRepaid,
  onSetEarlyReturned,
}: DuesSummaryProps) {
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
  const [showAllNotices, setShowAllNotices] = useState(false);
  const [showAllPairs, setShowAllPairs] = useState(false);
  const selectedSettlement = settlements.find((settlement) => getPairKey(settlement) === selectedPairKey);

  const getDirection = ({ personA, personB, netAmount, aOwesB, bOwesA }: PairSettlement) => {
    const aIsDebtor = Math.abs(netAmount) > EPSILON ? netAmount > 0 : aOwesB.total >= bOwesA.total;
    return aIsDebtor
      ? { debtorUid: personA, creditorUid: personB }
      : { debtorUid: personB, creditorUid: personA };
  };

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
              'h-auto w-full justify-start gap-3 rounded-md px-2! py-1.5! focus:outline-transparent!',
              rowClassName,
            )}
          >
            {content}
          </Button>
        ) : (
          <div className={join('flex items-center justify-between gap-3 px-2 py-1.5', rowClassName)}>
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
      <div key={`${fromUid}-${toUid}`} className='bg-muted/40 space-y-3 rounded-xl p-3'>
        {showTotals && (
          <div className='space-y-2'>
            <p className='text-sm font-medium'>
              {memberLabel(fromUid)} → {memberLabel(toUid)}
            </p>
            <div className='grid grid-cols-3 gap-2'>
              {renderStat('Total', formatAmount(owed.total))}
              {renderStat('Repaid', formatAmount(owed.repaid))}
              {renderStat('Still owed', formatAmount(owed.remaining), true)}
            </div>
          </div>
        )}
        <ul className={join('-mx-2', showTotals && 'border-border/60 border-t pt-2')}>
          {owed.items.map((item) => renderItem(item, canToggle))}
        </ul>
        {canToggle && (
          <p className='text-muted-foreground text-xs'>Tap an item once you&apos;ve paid it back.</p>
        )}
      </div>
    );
  };

  const getEarlyStateLabel = (item: EarlyItem, toUid: string) => {
    switch (item.state) {
      case 'PENDING':
        return 'Waiting for it to be paid';
      case 'APPLIED':
        return 'Counted toward this expense';
      case 'HELD':
        return `${memberLabel(toUid)} still has it`;
      case 'RETURNED':
        return 'Sent back';
    }
  };

  const renderEarly = (items: EarlyItem[], fromUid: string, toUid: string) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <div key={`early-${fromUid}-${toUid}`} className='bg-muted/40 space-y-2 rounded-xl p-3'>
        <p className='text-sm font-medium'>
          {memberLabel(fromUid)} paid {memberLabel(toUid)} early
        </p>
        <ul className='divide-border/60 divide-y'>
          {items.map((item) => (
            <li key={item.expense.id} className='flex items-center justify-between gap-3 py-1.5 text-sm'>
              <span className='min-w-0'>
                <span className='block truncate'>{item.expense.title}</span>
                <span className='text-muted-foreground block text-xs'>{getEarlyStateLabel(item, toUid)}</span>
              </span>
              <span className='flex shrink-0 items-center gap-2'>
                <span className={join('tabular-nums', item.state === 'RETURNED' && 'text-muted-foreground')}>
                  {formatAmount(item.payment.amount)}
                </span>
                {fromUid === currentUserId && item.state !== 'APPLIED' && (
                  <Button
                    type='button'
                    variant='link'
                    className='h-10 text-xs'
                    onClick={() => onSetEarlyReturned(item.expense.id, item.state !== 'RETURNED')}
                  >
                    {item.state === 'RETURNED' ? 'Undo' : 'Got it back'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const notices = settlements
    .flatMap(({ aPaidEarly, bPaidEarly, personA, personB }) => [
      ...aPaidEarly.map((item) => ({ item, fromUid: personA, toUid: personB })),
      ...bPaidEarly.map((item) => ({ item, fromUid: personB, toUid: personA })),
    ])
    .filter(({ item, fromUid, toUid }) =>
      (fromUid === currentUserId || toUid === currentUserId) && (item.state === 'PENDING' || item.state === 'HELD'),
    )
    .map(({ item, fromUid, toUid }) => {
      const amount = formatAmount(item.payment.amount);
      const title = item.expense.title;
      const text =
        fromUid === currentUserId
          ? item.state === 'PENDING'
            ? `You sent ${memberLabel(toUid)} ${amount} early for ${title}. It cancels out once it's paid.`
            : `${memberLabel(toUid)} is still holding the ${amount} you sent early for ${title}.`
          : item.state === 'PENDING'
            ? `${memberLabel(fromUid)} sent you ${amount} early for ${title}. It's counted when you mark it paid.`
            : `You're holding ${amount} from ${memberLabel(fromUid)} for ${title}. Send it back and they can mark it returned.`;
      return { key: `${item.expense.id}-${fromUid}`, text };
    });
  const visibleNotices = showAllNotices ? notices : notices.slice(0, MAX_VISIBLE_NOTICES);
  const yoursFirst = [...settlements].sort(
    (first, second) =>
      Number([second.personA, second.personB].includes(currentUserId)) -
      Number([first.personA, first.personB].includes(currentUserId)),
  );
  const visibleSettlements = showAllPairs ? yoursFirst : yoursFirst.slice(0, MAX_VISIBLE_PAIRS);

  const renderBreakdown = (settlement: PairSettlement) => {
    const { personA, personB, netAmount, aOwesB, bOwesA } = settlement;
    const showTotals =
      (aOwesB.total > EPSILON && bOwesA.total > EPSILON) ||
      aOwesB.repaid > EPSILON ||
      bOwesA.repaid > EPSILON;
    const { debtorUid, creditorUid } = getDirection(settlement);

    return (
      <div className='space-y-4'>
        <div className='border-border flex items-center justify-between gap-3 rounded-full border px-4 py-2.5'>
          <p className='min-w-0 text-sm leading-tight font-medium'>
            {memberLabel(debtorUid)} owes {memberLabel(creditorUid)}
          </p>
          <p className='shrink-0 text-base font-semibold tabular-nums'>
            {formatAmount(Math.abs(netAmount))}
            <span className='text-muted-foreground ml-1 text-xs font-normal'>net</span>
          </p>
        </div>
        {renderDirection(personA, personB, aOwesB, showTotals)}
        {renderDirection(personB, personA, bOwesA, showTotals)}
        {renderEarly(settlement.aPaidEarly, personA, personB)}
        {renderEarly(settlement.bPaidEarly, personB, personA)}
      </div>
    );
  };

  return (
    <>
      {notices.length > 0 && (
        <div className='bg-muted/50 mt-2 space-y-1.5 rounded-xl p-3'>
          {visibleNotices.map((notice) => (
            <p key={notice.key} className='flex items-start gap-2 text-sm'>
              <HandCoins className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
              <span className='min-w-0'>{notice.text}</span>
            </p>
          ))}
          {notices.length > MAX_VISIBLE_NOTICES && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-10 px-0!'
              onClick={() => setShowAllNotices((current) => !current)}
            >
              {showAllNotices ? 'Show fewer' : `Show ${notices.length - MAX_VISIBLE_NOTICES} more`}
            </Button>
          )}
        </div>
      )}
      <ul className='divide-border -mx-3 mt-1 divide-y'>
        {visibleSettlements.map((settlement) => {
          const { netAmount } = settlement;
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
                  {memberLabel(debtorUid)} owes {memberLabel(creditorUid)}
                </span>
                <span className='flex shrink-0 items-center gap-1'>
                  <span
                    className={join(
                      'text-sm tabular-nums',
                      settled ? 'text-muted-foreground' : 'font-semibold',
                    )}
                  >
                    {formatAmount(Math.abs(netAmount))}
                  </span>
                  <ChevronRight className='text-muted-foreground h-4 w-4' />
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      {settlements.length > MAX_VISIBLE_PAIRS && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          onClick={() => setShowAllPairs((current) => !current)}
        >
          {showAllPairs ? 'Show fewer' : `Show all ${settlements.length}`}
        </Button>
      )}
      <DetailSheet
        isOpen={selectedSettlement !== undefined}
        onClose={() => setSelectedPairKey(null)}
        title='Dues'
      >
        {selectedSettlement && renderBreakdown(selectedSettlement)}
      </DetailSheet>
    </>
  );
}

export default DuesSummary;
