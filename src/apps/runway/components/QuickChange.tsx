import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import BackLink from '@/components/BackLink';
import type { QuestionStep } from '@/hooks/useQuestionFlow';
import { ITEM_SHEET_R2_WORDS } from '@apps/runway/constants';

interface QuickChangeProps {
  step: QuestionStep;
  /** Back to the sheet that opened this question. */
  onBack?: () => void;
  /** Opens the view that lists every other field as a row. */
  onAll: () => void;
  /** Giving an undated item its first date: just the question, no door to the rest. */
  isFirstDate?: boolean;
}

/** The most frequent change to an item: only its one question, with one door to the rest of its fields. */
function QuickChange({
  step,
  onBack,
  onAll,
  isFirstDate = false,
}: QuickChangeProps) {
  return (
    <div className='space-y-4' role='group' aria-label={step.title}>
      {onBack && <BackLink onBack={onBack} />}
      <h3 className='text-2xl leading-tight font-semibold break-words'>
        {step.title}
      </h3>
      {step.render({ moveOn: () => undefined })}
      {isFirstDate ? (
        <p className='text-muted-foreground text-sm'>
          {ITEM_SHEET_R2_WORDS.firstDateNote}
        </p>
      ) : (
        <Button
          type='button'
          variant='tertiary'
          className='text-muted-foreground! relative h-auto min-h-10 w-full justify-between rounded-none px-1! py-1.5 font-normal'
          onClick={onAll}
        >
          <span>{ITEM_SHEET_R2_WORDS.changeElse}</span>
          <ChevronRight
            className='text-muted-foreground h-5 w-5'
            aria-hidden='true'
          />
        </Button>
      )}
    </div>
  );
}

export default QuickChange;
