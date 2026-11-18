import DateInput from '@/components/DateInput';
import SummaryEditor from '@/components/SummaryEditor';
import MoneyInput from '@/components/MoneyInput';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import PaysStartRow from '@apps/runway/components/PaysStartRow';
import { HORIZON_NEXT_WORDS } from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  listCarriedCosts,
  shiftNextDate,
  type CostPaidEntry,
} from '@apps/runway/engine/horizon';
import type { HorizonSealed } from '@apps/runway/types';
import {
  NEXT_LAST_DATE_MONTHS,
  type NextDraft,
} from '@apps/runway/utils/horizonNextDraft';

interface HorizonNextFieldsProps {
  horizon: HorizonSealed;
  paid: readonly CostPaidEntry[];
  draft: NextDraft;
  onChange: (draft: NextDraft) => void;
  today: number;
  isDisabled?: boolean;
}

/** The day the next event will be, when pays start saving for it and each copied cost's amount. */
function HorizonNextFields({
  horizon,
  paid,
  draft,
  onChange,
  today,
  isDisabled = false,
}: HorizonNextFieldsProps) {
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
    <div className='space-y-3'>
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
        <SummaryEditor
          label={HORIZON_NEXT_WORDS.costsTitle}
          summary={HORIZON_NEXT_WORDS.costsCopied(carried.length)}
          placeholder=''
          title={HORIZON_NEXT_WORDS.costsTitle}
          isFramed
          shouldFocus={false}
        >
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
                          shiftNextDate(
                            horizon.happensOn,
                            { happensOn: newDay, startsOn: null, today },
                            cost.schedule.anchor,
                          ),
                        )}
                      </p>
                    )}
                  </div>
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
                </li>
              );
            })}
          </ul>
        </SummaryEditor>
      )}
    </div>
  );
}

export default HorizonNextFields;
