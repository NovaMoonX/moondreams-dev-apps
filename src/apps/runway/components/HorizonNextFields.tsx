import { Eye } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import MoneyInput from '@/components/MoneyInput';
import SummaryRow from '@/components/SummaryRow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import PaysStartRow from '@apps/runway/components/PaysStartRow';
import { HORIZON_NEXT_WORDS } from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  listCarriedCosts,
  shiftNextAnchor,
  type CostPaidEntry,
} from '@apps/runway/engine/horizon';
import type { HorizonSealed } from '@apps/runway/types';
import {
  NEXT_LAST_DATE_MONTHS,
  type NextDraft,
} from '@apps/runway/utils/horizonNextDraft';

interface HorizonNextViewProps {
  horizon: HorizonSealed;
  paid: readonly CostPaidEntry[];
  draft: NextDraft;
  onChange: (draft: NextDraft) => void;
  today: number;
  isDisabled?: boolean;
}

interface HorizonNextFieldsProps extends HorizonNextViewProps {
  onOpenCosts: () => void;
}

interface HorizonNextCostsProps extends HorizonNextViewProps {
  onBack: () => void;
}

/** The day the next event will be, when pays start saving for it and a row that opens each copied cost's amount. */
function HorizonNextFields({
  horizon,
  paid,
  draft,
  onChange,
  today,
  isDisabled = false,
  onOpenCosts,
}: HorizonNextFieldsProps) {
  const lastDate = addUtcMonths(today, NEXT_LAST_DATE_MONTHS);
  const carried = listCarriedCosts(horizon, paid);
  return (
    <div
      className='space-y-3'
      data-sensitive={carried.length > 0 ? '' : undefined}
    >
      <DateInput
        variant='outline'
        aria-label={HORIZON_NEXT_WORDS.dateLabel}
        min={toDateInputValue(today)}
        max={toDateInputValue(lastDate)}
        value={draft.date}
        disabled={isDisabled}
        onChange={(event) => onChange({ ...draft, date: event.target.value })}
      />
      {(horizon.rest.kind === 'pays' || horizon.rest.kind === 'onePay') && (
        <PaysStartRow
          value={draft.startsOn}
          onChange={(startsOn) => onChange({ ...draft, startsOn })}
          today={today}
          lastDate={lastDate}
        />
      )}
      {carried.length > 0 && (
        <SummaryRow label={HORIZON_NEXT_WORDS.costsTitle} onClick={onOpenCosts}>
          {HORIZON_NEXT_WORDS.costsCopied(carried.length)}
        </SummaryRow>
      )}
    </div>
  );
}

/** The view swapped in for the fields: each copied cost with the day it moves to and its amount, a door to showing amounts while they are hidden. */
export function HorizonNextCosts({
  horizon,
  paid,
  draft,
  onChange,
  today,
  onBack,
}: HorizonNextCostsProps) {
  const { isHidden, toggle: showAmounts } = useValuesHidden();
  const lastDate = addUtcMonths(today, NEXT_LAST_DATE_MONTHS);
  const carried = listCarriedCosts(horizon, paid);
  const newDay = fromDateInputValue(draft.date);
  const isNewDayUsable =
    newDay !== undefined && newDay >= today && newDay <= lastDate;
  const setAmount = (id: string, part: 'low' | 'high', text: string) =>
    onChange({
      ...draft,
      amounts: {
        ...draft.amounts,
        [id]: { ...draft.amounts[id], [part]: text },
      },
    });
  return (
    <div className='space-y-4' data-sensitive=''>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_NEXT_WORDS.costsTitle}</ActionTitle>
      <ul className='space-y-3'>
        {carried.map(({ cost }) => {
          const typed = draft.amounts[cost.id];
          const isRange = cost.amount.lowCents !== cost.amount.highCents;
          return (
            <li key={cost.id} className='space-y-1'>
              <div className='flex items-baseline justify-between gap-3'>
                <p className='min-w-0 text-sm break-words'>{cost.name}</p>
                {isNewDayUsable && cost.schedule.anchor !== null && (
                  <p className='text-muted-foreground shrink-0 text-sm'>
                    {formatDateOrdinalUTC(
                      shiftNextAnchor(
                        horizon.happensOn,
                        { happensOn: newDay, startsOn: null, today },
                        { ...cost.schedule, anchor: cost.schedule.anchor },
                      ),
                    )}
                  </p>
                )}
              </div>
              {!isHidden && (
                <div className='flex gap-2'>
                  <MoneyInput
                    variant='outline'
                    ariaLabel={
                      isRange
                        ? HORIZON_NEXT_WORDS.lowOf(cost.name)
                        : HORIZON_NEXT_WORDS.amountOf(cost.name)
                    }
                    value={typed?.low ?? ''}
                    onChange={(text) => setAmount(cost.id, 'low', text)}
                    wrapperClassName='flex-1'
                  />
                  {isRange && (
                    <MoneyInput
                      variant='outline'
                      ariaLabel={HORIZON_NEXT_WORDS.highOf(cost.name)}
                      value={typed?.high ?? ''}
                      onChange={(text) => setAmount(cost.id, 'high', text)}
                      wrapperClassName='flex-1'
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {isHidden && (
        <Button
          type='button'
          variant='secondary'
          className='text-foreground! relative h-auto min-h-11 w-full justify-between rounded-2xl px-3! py-2 font-normal'
          onClick={showAmounts}
        >
          <span>{HORIZON_NEXT_WORDS.showToChange}</span>
          <Eye className='text-muted-foreground h-5 w-5' aria-hidden='true' />
        </Button>
      )}
    </div>
  );
}

export default HorizonNextFields;
