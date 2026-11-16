import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import PatternSheet from '@apps/helm/components/noticed/PatternSheet';
import { readYes } from '@apps/helm/components/noticed/patternWords';
import { usePatternAnswers } from '@apps/helm/components/noticed/usePatternAnswers';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenPattern } from '@apps/helm/types';

interface PatternOfferCardProps {
  pattern: OpenPattern;
  /** Where the person makes the change themselves (the habit's When sheet); `onSaved` is called once that change saves. None draws no yes that needs it. */
  onChange?: (onSaved: () => void) => void;
}

/** What was noticed about something the person set, asked once: the yes is named for its change (one that only opens the place to change it accepts the pattern when that saves, and is left out where there is no such place), "Not now" waits below a hairline, and "Stop suggesting that" is a tap further, in the pattern's sheet. Something going well is a solid card, since it is about what is already theirs. Care is only ever asked. */
function PatternOfferCard({ pattern, onChange }: PatternOfferCardProps) {
  const answers = usePatternAnswers();
  const [isOpen, setIsOpen] = useState(false);
  const isCare = pattern.handling === 'askOnly';
  const isGoingWell = pattern.kind === 'saidWorking';
  const yes = readYes(pattern);
  const isBusy = answers.busyId !== null;

  const hasYes = yes !== null && (yes.isDirect || onChange !== undefined);

  const sayYes = () => {
    if (!yes) return;
    if (yes.isDirect) void answers.accept(pattern);
    else onChange?.(() => void answers.accept(pattern));
  };

  return (
    <section
      className={join(
        'helm-card border-primary/40 space-y-3 border p-4',
        !isGoingWell && 'border-dashed',
      )}
    >
      {isGoingWell && (
        <p className='text-muted-foreground text-[13px] font-medium'>
          {HELM_COPY.noticedWorkingTitle}
        </p>
      )}
      <p className='text-foreground text-[15px] leading-[21px] font-medium text-pretty'>
        {pattern.statement}
      </p>
      <Button
        type='button'
        variant='tertiary'
        className='text-muted-foreground -mx-2 flex h-auto min-h-9 w-[calc(100%+1rem)] justify-between gap-2 px-2! py-1.5 text-left text-[13px] font-normal'
        onClick={() => setIsOpen(true)}
      >
        <span className='min-w-0 flex-1 break-words'>
          {pattern.evidenceLine || HELM_COPY.noticedWhyOther}
        </span>
        <ChevronRight className='size-4 shrink-0' aria-hidden='true' />
      </Button>
      {isCare && onChange && (
        <Button
          type='button'
          className='w-full'
          disabled={isBusy}
          onClick={() => onChange(() => undefined)}
        >
          {HELM_COPY.noticedYes.changeTime}
        </Button>
      )}
      {!isCare && yes && hasYes && (
        <Button
          type='button'
          className='w-full'
          loading={answers.busyId === pattern.id}
          disabled={isBusy}
          onClick={sayYes}
        >
          {yes.label}
        </Button>
      )}
      <div className='border-border flex justify-center border-t pt-3'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={isBusy}
          onClick={() =>
            void (isCare ? answers.confirm(pattern) : answers.notNow(pattern))
          }
        >
          {isCare ? HELM_COPY.noticedItsRight : HELM_COPY.noticedNotNow}
        </Button>
      </div>
      <PatternSheet
        patternId={isOpen ? pattern.id : null}
        onClose={() => setIsOpen(false)}
        onChange={onChange}
      />
    </section>
  );
}

export default PatternOfferCard;
