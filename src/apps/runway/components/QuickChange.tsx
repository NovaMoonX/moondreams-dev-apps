import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import QuestionFlow from '@/components/QuestionFlow';
import type { QuestionFlowState, QuestionStep } from '@/hooks/useQuestionFlow';
import { ITEM_SHEET_R2_WORDS } from '@apps/runway/constants';

interface QuickChangeProps {
  step: QuestionStep;
  flow: QuestionFlowState;
  /** The few other questions worth a folded row under the open one; the rest are behind "More details". */
  rowIds: string[];
  /** Opens the view that lists every field as a row. */
  onAll: () => void;
  /** Giving an undated item its first date: just the question, no door to the rest. */
  isFirstDate?: boolean;
}

/** The most frequent change to an item: its one question open, the most useful other fields folded under it and one door to the rest. */
function QuickChange({
  step,
  flow,
  rowIds,
  onAll,
  isFirstDate = false,
}: QuickChangeProps) {
  const rows = rowIds
    .map((id) => flow.steps.find((other) => other.id === id))
    .filter((other): other is QuestionStep => other !== undefined)
    .filter((other) => other.id !== step.id);
  const hasMore = flow.steps.some(
    (other) => other.id !== step.id && !rowIds.includes(other.id),
  );
  const rowsFlow: QuestionFlowState = {
    ...flow,
    steps: rows,
    open: null,
    isReview: true,
    hasReviewed: true,
  };
  return (
    <div className='space-y-4' role='group' aria-label={step.title}>
      <h3 className='text-2xl leading-tight font-semibold break-words'>
        {step.title}
      </h3>
      {step.render({ moveOn: () => undefined })}
      {isFirstDate ? (
        <p className='text-muted-foreground text-sm'>
          {ITEM_SHEET_R2_WORDS.firstDateNote}
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <QuestionFlow flow={rowsFlow} shouldFocus={false} />
          )}
          {hasMore && (
            <Button
              type='button'
              variant='secondary'
              className='text-foreground! relative h-auto min-h-11 w-full justify-between rounded-2xl px-3! py-2 font-normal'
              onClick={onAll}
            >
              <span>{ITEM_SHEET_R2_WORDS.moreDetails}</span>
              <ChevronRight
                className='text-muted-foreground h-5 w-5'
                aria-hidden='true'
              />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default QuickChange;
