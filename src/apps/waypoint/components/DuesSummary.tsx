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
  /** Takes an early payment off its expense: its author always can, and so can an editor. */
  canRemoveEarly: (fromUid: string) => boolean;
  onRemoveEarly: (expenseId: string, fromUid: string) => void;
}

const getPairKey = (settlement: PairSettlement) => `${settlement.personA}-${settlement.personB}`;

function DuesSummary({
  settlements,
  currentUserId,
  memberLabel,
  formatAmount,
  onToggleRepaid,
  onSetEarlyReturned,
  canRemoveEarly,
  onRemoveEarly,
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
        return `${memberLabel(toUid)} is holding it until this is paid`;
      case 'APPLIED': {
        const extra = item.payment.amount - item.applied;
        return extra > EPSILON
          ? `${formatAmount(item.applied)} counted toward their share, ${formatAmount(extra)} owed back`
          : 'Counted toward their share';
      }
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
                {canRemoveEarly(fromUid) && (
                  <Button
                    type='button'
                    variant='link'
                    className='h-10 text-xs'
                    onClick={() => onRemoveEarly(item.expense.id, fromUid)}
                  >
                    Remove
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
            ? `You sent ${memberLabel(toUid)} ${amount} early for ${title}. It's already taken off what you owe them, and it covers your share once they pay.`
            : `${memberLabel(toUid)} is still holding the ${amount} you sent early for ${title}.`
          : item.state === 'PENDING'
            ? `${memberLabel(fromUid)} sent you ${amount} early for ${title}. It's already taken off what they owe you. If someone else pays, you'll owe it back.`
            : `You're holding ${amount} from ${memberLabel(fromUid)} for ${title}. Send it back and they can mark it returned.`;
      return { key: `${item.expense.id}-${fromUid}`, text };
    });
  const visibleNotices = showAllNotices ? notices : notices.slice(0, MAX_VISIBLE_NOTICES);
  const involvesMe = (settlement: PairSettlement) => [settlement.personA, settlement.personB].includes(currentUserId);
  const myPairs = settlements.filter(involvesMe);
  const isSending = (settlement: PairSettlement) => getDirection(settlement).debtorUid === currentUserId;
  const toSend = myPairs.filter((settlement) => isSending(settlement) && !isPairSettled(settlement));
  const toCollect = myPairs.filter((settlement) => !isSending(settlement) && !isPairSettled(settlement));
  const settledMine = myPairs.filter(isPairSettled);
  const others = settlements.filter((settlement) => !involvesMe(settlement));
  const visibleOthers = showAllPairs ? others : others.slice(0, MAX_VISIBLE_PAIRS);

  const renderPair = (settlement: PairSettlement) => {
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
            <span className={join('text-sm tabular-nums', settled ? 'text-muted-foreground' : 'font-semibold')}>
              {formatAmount(Math.abs(netAmount))}
            </span>
            <ChevronRight className='text-muted-foreground h-4 w-4' />
          </span>
        </Button>
      </li>
    );
  };

  const renderGroup = (heading: string, items: PairSettlement[]) =>
    items.length === 0 ? null : (
      <div key={heading} className='mt-3 first:mt-1'>
        <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>{heading}</p>
        <ul className='divide-border -mx-3 divide-y'>{items.map(renderPair)}</ul>
      </div>
    );

  const renderNetWorking = ({ personA, personB, netAmount, aOwesB, bOwesA, aPaidEarly, bPaidEarly }: PairSettlement) => {
    const held = (items: EarlyItem[]) =>
      items.filter((item) => item.state !== 'RETURNED').reduce((total, item) => total + item.payment.amount - item.applied, 0);
    const rows = [
      { label: `${memberLabel(personA)} owes ${memberLabel(personB)}`, amount: aOwesB.remaining },
      { label: `${memberLabel(personB)} owes ${memberLabel(personA)}`, amount: -bOwesA.remaining },
      { label: `${memberLabel(personB)} holds for ${memberLabel(personA)}`, amount: -held(aPaidEarly) },
      { label: `${memberLabel(personA)} holds for ${memberLabel(personB)}`, amount: held(bPaidEarly) },
    ].filter((row) => Math.abs(row.amount) > EPSILON);
    if (held(aPaidEarly) + held(bPaidEarly) <= EPSILON) {
      return null;
    }

    return (
      <div className='border-border space-y-1 rounded-xl border p-3'>
        <p className='text-sm font-medium'>How the net adds up</p>
        {rows.map((row) => (
          <p key={row.label} className='flex items-baseline justify-between gap-3 text-sm'>
            <span className='text-muted-foreground min-w-0'>{row.label}</span>
            <span className='shrink-0 whitespace-nowrap tabular-nums'>
              {row.amount < 0 ? '−' : '+'}
              {formatAmount(Math.abs(row.amount))}
            </span>
          </p>
        ))}
        <p className='border-border flex items-baseline justify-between gap-3 border-t pt-1 text-sm font-semibold'>
          <span>Net</span>
          <span className='shrink-0 whitespace-nowrap tabular-nums'>
            {netAmount < 0 ? '−' : '+'}
            {formatAmount(Math.abs(netAmount))}
          </span>
        </p>
        <p className='text-muted-foreground text-xs'>
          Plus means {memberLabel(personA)} owes {memberLabel(personB)}; minus means the other way around.
        </p>
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
        {renderNetWorking(settlement)}
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
      {renderGroup('Money to send', toSend)}
      {renderGroup('Money to collect', toCollect)}
      {renderGroup('All square', settledMine)}
      {renderGroup(myPairs.length === 0 ? 'Between others' : 'Everyone else', visibleOthers)}
      {others.length > MAX_VISIBLE_PAIRS && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          onClick={() => setShowAllPairs((current) => !current)}
        >
          {showAllPairs ? 'Show fewer' : `Show all ${others.length} others`}
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
