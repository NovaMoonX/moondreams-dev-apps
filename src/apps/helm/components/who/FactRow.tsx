import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import SourceRing from '@apps/helm/components/who/SourceRing';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenFact } from '@apps/helm/types';
import { getFactLine } from '@apps/helm/utils/factLines';

interface FactRowProps {
  fact: OpenFact;
  assistant: string;
  now: number;
  /** Names who or what the fact is about, for a list that mixes subjects. */
  subject?: string;
  onOpen: (factId: string) => void;
}

/** One fact: its ring, its words and a quiet line of who stands behind it. Opens the fact. */
function FactRow({ fact, assistant, now, subject, onOpen }: FactRowProps) {
  const isConfirmed = fact.status === 'confirmed';
  const line = [
    getFactLine(fact, assistant, now),
    fact.disputedWithId ? HELM_COPY.factTwoAnswers : null,
  ]
    .filter(Boolean)
    .join(' \u00b7 ');
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-start gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(fact.id)}
    >
      <SourceRing
        isConfirmed={isConfirmed}
        label={
          isConfirmed
            ? HELM_COPY.factRingSaid
            : HELM_COPY.factRingInferred(assistant)
        }
        className='mt-1.5'
      />
      <span className='min-w-0 flex-1'>
        <span className='block'>
          <span className='text-foreground line-clamp-3 text-[15px] leading-[21px] text-pretty break-words'>
            {fact.statement}
          </span>
        </span>
        <span className='text-muted-foreground block text-[13px] break-words'>
          {subject ? `${subject} · ${line}` : line}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-1 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default FactRow;
