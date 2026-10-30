import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  describeGroupRow,
  type ProblemGroup,
} from '@apps/runway/utils/lookaheadText';
import { FIX_WORDS } from '@apps/runway/constants';
import { keepEntryFor } from '@apps/runway/utils/leaveAfterClose';

interface ProblemRowProps {
  group: ProblemGroup;
}

/** One day that runs short, or one problem not tied to a day: what is short or missing and when, as a row that opens the income day it runs short on, or the bills. */
function ProblemRow({ group }: ProblemRowProps) {
  const { openDay, openDueBill, showPlanSection, showTab, closeFixes } =
    useRunwayUrlState();
  const { isHidden } = useValuesHidden();
  const { title, detail } = describeGroupRow(group, isHidden);
  const isDay = group.kind === 'day';

  const open = () => {
    if (group.kind === 'day') {
      keepEntryFor('fixes');
      openDay(group.dayKey);
      return;
    }
    closeFixes();
    if (group.kind === 'undated' && group.bills.length === 1)
      openDueBill(group.bills[0].billId);
    showPlanSection('bills');
    showTab('plan');
  };

  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
      aria-label={`${title}, ${detail}. ${group.kind === 'day' ? FIX_WORDS.openDay : group.kind === 'undated' && group.bills.length === 1 ? FIX_WORDS.openDueBill : FIX_WORDS.openBills}`}
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
  );
}

export default ProblemRow;
