import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import type { LookaheadProblem } from '@apps/runway/engine/lookahead';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { describeProblem } from '@apps/runway/utils/lookaheadText';
import { leaveAfterSubviewCloses } from '@apps/runway/utils/leaveAfterClose';

interface ProblemRowProps {
  problem: LookaheadProblem;
  /** Closes the sheet the row sits in; the row then opens its door once the sheet's history step is done. */
  onLeave?: () => void;
}

/** One thing that stops the plan, as a row that opens the income day it runs short on, or the bills for a bill with no income or one past due. */
function ProblemRow({ problem, onLeave }: ProblemRowProps) {
  const { openDay, showPlanSection, showTab } = useRunwayUrlState();
  const text = describeProblem(problem);

  const go = () => {
    if (problem.kind === 'short') {
      openDay(problem.dayKey);
      return;
    }
    showPlanSection('bills');
    showTab('plan');
  };
  const open = () => {
    if (!onLeave) {
      go();
      return;
    }
    onLeave();
    leaveAfterSubviewCloses(go);
  };

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-auto min-h-11 w-full items-start justify-start gap-3 p-3 text-left text-sm font-normal whitespace-normal'
      aria-label={`${text} ${problem.kind === 'short' ? 'Open this income day' : 'Open your bills'}`}
      onClick={open}
    >
      <TriangleAlert
        className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1 break-words'>{text}</span>
      <ChevronRight
        className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default ProblemRow;
