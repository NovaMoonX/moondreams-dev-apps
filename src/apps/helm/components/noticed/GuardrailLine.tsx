import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import GuardrailSheet from '@apps/helm/components/noticed/GuardrailSheet';
import {
  isHoldingStarted,
  isTaskGuardrail,
  readPauseUntil,
  readReasonLines,
  readTaskDay,
  toShortDay,
} from '@apps/helm/components/noticed/guardrailWords';
import { useGuardrailAnswers } from '@apps/helm/components/noticed/useGuardrailAnswers';
import { useGuardrailSubjectName } from '@apps/helm/components/noticed/useGuardrailThings';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenPattern } from '@apps/helm/types';

interface GuardrailLineProps {
  pattern: OpenPattern;
  /** Opens the task's due date; a task's card has no first answer without it. */
  onFindLater?: () => void;
}

/** Advice to hold something off, in the offer card's dashed look: the suggestion, one line per reason, the one answer that does it and a quiet no below a hairline. The other choices are in the sheet. It only advises: the thing was made as said and nothing waits on this. */
function GuardrailLine({ pattern, onFindLater }: GuardrailLineProps) {
  const answers = useGuardrailAnswers();
  const [isOpen, setIsOpen] = useState(false);
  const name = useGuardrailSubjectName(pattern);
  const reasons = readReasonLines(pattern);
  const isTask = isTaskGuardrail(pattern);
  const isStart = pattern.moment === 'onStart';
  const date = toShortDay(readPauseUntil(pattern));
  const isBusy = answers.busyId !== null;
  const yes = isStart
    ? isHoldingStarted(pattern)
      ? HELM_COPY.guardrailHold(date)
      : HELM_COPY.guardrailPauseNamed(name, date)
    : HELM_COPY.guardrailPause(date);
  const no = isTask
    ? HELM_COPY.guardrailKeepDay(readTaskDay(pattern))
    : isStart
      ? HELM_COPY.guardrailStartNow
      : HELM_COPY.guardrailKeepGoing;

  return (
    <section className='helm-card border-primary/40 w-full space-y-3 border border-dashed p-4'>
      <p className='text-foreground text-[15px] leading-[21px] font-medium text-pretty'>
        {pattern.statement}
      </p>
      <ul className='space-y-1.5'>
        {reasons.map(({ kind, line, Icon }) => (
          <li
            key={kind}
            className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'
          >
            <Icon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
            <span className='min-w-0 break-words'>{line}</span>
          </li>
        ))}
      </ul>
      <Button
        type='button'
        variant='tertiary'
        className='text-muted-foreground -mx-2 flex h-auto min-h-9 w-[calc(100%+1rem)] justify-between gap-2 px-2! py-1.5 text-left text-[13px] font-normal'
        onClick={() => setIsOpen(true)}
      >
        <span className='min-w-0 flex-1 break-words'>
          {HELM_COPY.noticedWhyOther}
        </span>
        <ChevronRight className='size-4 shrink-0' aria-hidden='true' />
      </Button>
      {isTask ? (
        onFindLater && (
          <Button
            type='button'
            className='w-full'
            disabled={isBusy}
            onClick={onFindLater}
          >
            {HELM_COPY.guardrailFindLater}
          </Button>
        )
      ) : (
        <Button
          type='button'
          className='w-full'
          loading={answers.busyId === pattern.id}
          disabled={isBusy}
          onClick={() =>
            void answers.pause(pattern, { isHold: isHoldingStarted(pattern) })
          }
        >
          {yes}
        </Button>
      )}
      <div className='border-border flex justify-center border-t pt-3'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={isBusy}
          onClick={() => void answers.keepGoing(pattern)}
        >
          {no}
        </Button>
      </div>
      <GuardrailSheet
        patternId={isOpen ? pattern.id : null}
        onClose={() => setIsOpen(false)}
        onFindLater={onFindLater}
      />
    </section>
  );
}

export default GuardrailLine;
