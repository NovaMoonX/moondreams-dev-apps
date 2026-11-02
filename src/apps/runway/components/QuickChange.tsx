import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Eye } from 'lucide-react';

import BackLink from '@/components/BackLink';
import QuestionFlow from '@/components/QuestionFlow';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import type { QuestionFlowState, QuestionStep } from '@/hooks/useQuestionFlow';
import { ITEM_SHEET_R2_WORDS } from '@apps/runway/constants';

const MONEY_STEPS = ['amount', 'target', 'max'];
const SHORT_SCREEN_ROWS = 2;

interface QuickChangeProps {
  step: QuestionStep;
  flow: QuestionFlowState;
  /** The few other questions worth a folded row under the open one; the rest are behind "More details". */
  rowIds: string[];
  /** What sits between the rows and "More details": when the change starts and what it does. */
  after?: ReactNode;
  /** Shows the fields that are not on the front instead of the question. */
  isAll: boolean;
  onAll: () => void;
  onBack: () => void;
  /** Giving an undated item its first date: just the question, no door to the rest. */
  isFirstDate?: boolean;
}

/** The most frequent change to an item: its one question open, the most useful other fields folded under it and one door to the rest. */
function QuickChange({
  step,
  flow,
  rowIds,
  after = null,
  isAll,
  onAll,
  onBack,
  isFirstDate = false,
}: QuickChangeProps) {
  const { isHidden, toggle } = useValuesHidden();
  const isMoney = MONEY_STEPS.includes(step.id);
  const isShort = useIsShortScreen(599);
  const isLandscape = useIsShortScreen(419);
  const shownIds = rowIds.slice(
    0,
    isShort && !isLandscape ? SHORT_SCREEN_ROWS : rowIds.length,
  );
  const rows = shownIds
    .map((id) => flow.steps.find((other) => other.id === id))
    .filter((other): other is QuestionStep => other !== undefined)
    .filter((other) => other.id !== step.id);
  const toRows = (steps: QuestionStep[]): QuestionFlowState => ({
    ...flow,
    steps,
    open: null,
    isReview: true,
    hasReviewed: true,
  });
  const rest = flow.steps.filter(
    (other) => other.id !== step.id && !shownIds.includes(other.id),
  );
  if (isAll) {
    return (
      <div className='space-y-4'>
        <BackLink onBack={onBack} />
        <QuestionFlow flow={toRows(rest)} shouldFocus={false} />
        {after}
      </div>
    );
  }
  return (
    <div
      className='space-y-4 [@media(max-height:419px)]:space-y-1.5 [@media(min-height:420px)_and_(max-height:599px)]:space-y-2'
      role='group'
      aria-label={step.title}
      data-sensitive={isMoney ? '' : undefined}
    >
      <h3 className='text-2xl leading-tight font-semibold break-words [@media(max-height:419px)]:hidden [@media(min-height:420px)_and_(max-height:599px)]:text-lg'>
        {step.title}
      </h3>
      {isMoney && isHidden ? (
        <Button
          type='button'
          variant='secondary'
          className='text-foreground! relative h-auto min-h-11 w-full justify-between rounded-2xl px-3! py-2 font-normal'
          onClick={toggle}
        >
          <span>{ITEM_SHEET_R2_WORDS.showToChange}</span>
          <Eye className='text-muted-foreground h-5 w-5' aria-hidden='true' />
        </Button>
      ) : (
        <div className='[@media(max-height:419px)]:[&_button]:hidden [@media(max-height:419px)]:[&_input]:text-2xl [@media(max-height:419px)]:[&_label]:text-2xl [@media(max-height:599px)]:[&_p:first-child]:hidden [@media(min-height:420px)_and_(max-height:599px)]:[&_input]:text-3xl [@media(min-height:420px)_and_(max-height:599px)]:[&_label]:text-3xl'>
          {step.render({ moveOn: () => undefined })}
        </div>
      )}
      {isFirstDate ? (
        <p className='text-muted-foreground text-sm'>
          {ITEM_SHEET_R2_WORDS.firstDateNote}
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <div className='[@media(max-height:419px)]:[&_.space-y-2]:grid [@media(max-height:419px)]:[&_.space-y-2]:grid-cols-3 [@media(max-height:419px)]:[&_.space-y-2]:gap-2 [@media(max-height:419px)]:[&_.space-y-2>*]:m-0!'>
              <QuestionFlow flow={toRows(rows)} shouldFocus={false} />
            </div>
          )}
          {after}
          {rest.length > 0 && (
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
