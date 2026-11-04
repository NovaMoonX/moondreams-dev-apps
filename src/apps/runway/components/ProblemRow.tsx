import { useState } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  describeGroupRow,
  type ProblemGroup,
} from '@apps/runway/utils/lookaheadText';
import { FIX_WORDS, HORIZON_WORDS } from '@apps/runway/constants';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import {
  selectHorizonItems,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { keepEntryFor } from '@/hooks/useBackHistory';

interface ProblemRowProps {
  group: ProblemGroup;
}

/** One day that runs short, or one problem not tied to a day: what is short or missing and when, as a row that opens the income day it runs short on, or the bills. */
function ProblemRow({ group }: ProblemRowProps) {
  const {
    openDay,
    openDueBill,
    openUndatedBills,
    showPlanSection,
    showTab,
    closeFixes,
  } = useRunwayUrlState();
  const { isHidden } = useValuesHidden();
  const today = todayAsUtcDate(useNow(60_000));
  const { title, detail } = describeGroupRow(group, today, isHidden);
  const isDay = group.kind === 'day';
  const [isItemOpen, setIsItemOpen] = useState(false);
  const stance = useAppSelector(selectStance);
  const horizons = useAppSelector((state) => selectHorizonItems(state, today));
  const found =
    group.kind === 'horizon'
      ? (horizons.find(({ item }) => item.id === group.short.itemId) ?? null)
      : null;

  const open = () => {
    if (group.kind === 'day') {
      keepEntryFor('fixes');
      openDay(group.dayKey);
      return;
    }
    if (group.kind === 'horizon') {
      setIsItemOpen(true);
      return;
    }
    closeFixes();
    showPlanSection('bills');
    showTab('plan');
    if (group.kind !== 'undated') return;
    if (group.bills.length === 1) openDueBill(group.bills[0].billId);
    else openUndatedBills();
  };

  const getOpenLabel = () => {
    if (group.kind === 'day') return FIX_WORDS.openDay;
    if (group.kind === 'horizon')
      return HORIZON_WORDS.openItem(
        found?.version.payload.name ?? group.short.name,
      );
    return group.kind === 'undated' && group.bills.length === 1
      ? FIX_WORDS.openDueBill
      : FIX_WORDS.openBills;
  };

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
        aria-label={`${title}, ${detail}. ${getOpenLabel()}`}
        onClick={open}
      >
        <span
          className='grid size-9 shrink-0 place-items-center rounded-full bg-(--runway-warning-soft) text-(--runway-warning-ink) shadow-[inset_0_0_0_1px_var(--runway-warning-edge)]'
          aria-hidden='true'
        >
          <TriangleAlert className='h-4 w-4' />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block font-medium break-words'>{title}</span>
          <span
            className='text-muted-foreground block text-sm break-words'
            data-sensitive={isDay ? '' : undefined}
          >
            {detail}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground mt-2.5 h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      {isItemOpen && found && (
        <HorizonSheet
          itemId={found.item.id}
          horizon={found.version.payload}
          today={today}
          stance={stance}
          onClose={() => setIsItemOpen(false)}
        />
      )}
    </>
  );
}

export default ProblemRow;
