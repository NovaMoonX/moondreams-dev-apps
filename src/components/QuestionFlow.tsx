import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SummaryRow from '@/components/SummaryRow';
import type { QuestionFlowState } from '@/hooks/useQuestionFlow';

const FIRST_FOCUS_DELAY_MS = 350;
const STEP_FOCUS_DELAY_MS = 60;
const TYPED_FIELD =
  'input:not([type="date"]):not([type="number"]):not([type="checkbox"]), textarea';

interface QuestionFlowProps {
  flow: QuestionFlowState;
  /** Puts the cursor in a question's typed field as it opens. */
  shouldFocus?: boolean;
  nextLabel?: string;
}

/** A form asked one question at a time: the answered ones fold into rows that reopen them, the open one is large with only its control, and nothing follows it. With every question folded, the rows are the review and the form's footer holds its one primary. */
function QuestionFlow({
  flow,
  shouldFocus = true,
  nextLabel = 'Next',
}: QuestionFlowProps) {
  const { steps, open, reopen, advance } = flow;
  const openRef = useRef<HTMLDivElement>(null);
  const hasFocused = useRef(false);
  const openKey = open?.id ?? null;

  useEffect(() => {
    if (openKey === null || !shouldFocus) return;
    const delay = hasFocused.current
      ? STEP_FOCUS_DELAY_MS
      : FIRST_FOCUS_DELAY_MS;
    hasFocused.current = true;
    const timer = window.setTimeout(() => {
      openRef.current
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(TYPED_FIELD)
        ?.focus();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [openKey, shouldFocus]);

  const openIndex =
    open === null ? steps.length : steps.findIndex((s) => s.id === open.id);
  const folded = steps.slice(0, openIndex);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement))
      return;
    event.preventDefault();
    advance();
  };

  return (
    <div className='space-y-5'>
      {folded.length > 0 && (
        <div className='space-y-2'>
          {folded.map((step) => (
            <SummaryRow
              key={step.id}
              label={step.summaryLabel}
              ariaLabel={`${step.summaryLabel}: change`}
              onClick={() => reopen(step.id)}
            >
              {step.summaryValue || (
                <span className='text-muted-foreground'>Not answered yet</span>
              )}
            </SummaryRow>
          ))}
        </div>
      )}
      {open && (
        <div
          ref={openRef}
          className='space-y-4'
          onKeyDown={handleKeyDown}
          role='group'
          aria-labelledby={`question-${open.id}`}
        >
          <h3
            id={`question-${open.id}`}
            className='text-2xl leading-tight font-semibold break-words'
          >
            {open.title}
          </h3>
          {open.render()}
          <div>
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              className='h-10 gap-1.5 px-4'
              disabled={!open.isAnswered}
              onClick={advance}
            >
              {nextLabel}
              <ArrowRight className='h-4 w-4' aria-hidden='true' />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionFlow;
