import { useEffect, useRef, type KeyboardEvent } from 'react';

import SummaryRow from '@/components/SummaryRow';
import type { QuestionFlowState, QuestionStep } from '@/hooks/useQuestionFlow';

const FIRST_FOCUS_DELAY_MS = 350;
const STEP_FOCUS_DELAY_MS = 60;
const SCROLL_MARGIN_PX = 8;
const TYPED_FIELD =
  'input:not([type="date"]):not([type="number"]):not([type="checkbox"]), textarea';

interface QuestionFlowProps {
  flow: QuestionFlowState;
  /** Puts the cursor in a question's typed field (or on its heading) as it opens. */
  shouldFocus?: boolean;
}

const getScroller = (element: HTMLElement) => {
  const parents = (node: HTMLElement | null): HTMLElement[] =>
    node === null ? [] : [node, ...parents(node.parentElement)];
  const result =
    parents(element.parentElement).find((node) => {
      const { overflowY } = getComputedStyle(node);
      return (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight
      );
    }) ?? null;
  return result;
};

const getRowName = (step: QuestionStep) => {
  const value =
    step.summaryText ??
    (typeof step.summaryValue === 'string' ? step.summaryValue : '');
  const result = `${step.summaryLabel}, ${value || 'not answered yet'}, change`;
  return result;
};

/** A form asked one question at a time: the open one is large with only its control, the answered ones fold into rows that reopen it. Until every answer has been seen nothing follows the open question; after, a reopened answer keeps the rest folded around it. The way forward is the form's pinned footer (`flow.advance` while asking). */
function QuestionFlow({ flow, shouldFocus = true }: QuestionFlowProps) {
  const { steps, open, reopen, advance, hasReviewed } = flow;
  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastKey = useRef<string | null | undefined>(undefined);
  const openKey = open?.id ?? null;

  useEffect(() => {
    const isFirst = lastKey.current === undefined;
    const wasOpen = !isFirst && lastKey.current !== null;
    lastKey.current = openKey;
    if (!shouldFocus) return;
    if (openKey === null) {
      if (!wasOpen) return;
      const timer = window.setTimeout(() => {
        rootRef.current?.querySelector<HTMLElement>('button')?.focus();
      }, STEP_FOCUS_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => {
        const block = openRef.current;
        if (block === null) return;
        const scroller = isFirst ? null : getScroller(block);
        if (scroller !== null) {
          const top =
            block.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop -
            SCROLL_MARGIN_PX;
          scroller.scrollTo({ top });
        }
        const field =
          block.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            TYPED_FIELD,
          ) ?? headingRef.current;
        field?.focus({ preventScroll: true });
      },
      isFirst ? FIRST_FOCUS_DELAY_MS : STEP_FOCUS_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [openKey, shouldFocus]);

  const openIndex =
    open === null ? steps.length : steps.findIndex((s) => s.id === open.id);
  const before = steps.slice(0, openIndex);
  const after = open !== null && hasReviewed ? steps.slice(openIndex + 1) : [];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement))
      return;
    event.preventDefault();
    advance();
  };

  const rows = (list: QuestionStep[]) =>
    list.length > 0 && (
      <div className='space-y-2'>
        {list.map((step) => (
          <SummaryRow
            key={step.id}
            label={step.summaryLabel}
            ariaLabel={getRowName(step)}
            onClick={() => reopen(step.id)}
          >
            {step.summaryValue || (
              <span className='text-muted-foreground'>Not answered yet</span>
            )}
          </SummaryRow>
        ))}
      </div>
    );

  return (
    <div ref={rootRef} className='space-y-5'>
      {rows(before)}
      {open && (
        <div
          ref={openRef}
          className='space-y-4'
          onKeyDown={handleKeyDown}
          role='group'
          aria-labelledby={`question-${open.id}`}
        >
          <h3
            ref={headingRef}
            id={`question-${open.id}`}
            tabIndex={-1}
            className='text-2xl leading-tight font-semibold break-words outline-none'
          >
            {open.title}
          </h3>
          {open.render()}
        </div>
      )}
      {rows(after)}
    </div>
  );
}

export default QuestionFlow;
