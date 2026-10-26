import { useState } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import { formatDateUTC } from '@/utils/formatUtils';
import { PROBLEM_WORDS } from '@apps/runway/constants';
import { describeProblemShort } from '@apps/runway/utils/lookaheadText';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import ProblemRow from '@apps/runway/components/ProblemRow';

interface LookaheadWarningsProps {
  lookahead: Lookahead;
}

/** What stops the plan, as one counted row; it opens the list, one row per problem, each a door to what it is about. */
function LookaheadWarnings({ lookahead }: LookaheadWarningsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { problems, incomeEndsOn } = lookahead;
  const first = problems[0] ?? null;
  const endsText =
    incomeEndsOn === null
      ? null
      : `Your last income day is ${formatDateUTC(incomeEndsOn)}. Nothing is planned after it.`;

  if (!first && !endsText) return null;
  const label = first ? describeProblemShort(first) : endsText;
  const more = problems.length - 1;

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='border-border bg-card text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-1.5 text-left font-normal whitespace-normal'
        onClick={() => setIsOpen(true)}
      >
        <span
          className='bg-accent grid size-8 shrink-0 place-items-center rounded-full'
          aria-hidden='true'
        >
          <TriangleAlert className='text-muted-foreground h-4 w-4' />
        </span>
        <span className='min-w-0 flex-1 text-sm font-medium'>
          {label}
          {more > 0 && (
            <span className='text-muted-foreground font-normal whitespace-nowrap'>
              {' '}
              · {more} more
            </span>
          )}
        </span>
        <ChevronRight
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={PROBLEM_WORDS.title}
      >
        {isOpen && (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {problems.map((problem, index) => (
              <li key={`${index}:${problem.kind}:${problem.on}`}>
                <ProblemRow
                  problem={problem}
                  onLeave={() => setIsOpen(false)}
                />
              </li>
            ))}
            {incomeEndsOn !== null && (
              <li className='flex items-start gap-3 p-3 text-sm'>
                <TriangleAlert
                  className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
                  aria-hidden='true'
                />
                <span className='min-w-0 break-words'>
                  Your last income day is {formatDateUTC(incomeEndsOn)}. Nothing
                  is planned after it.
                </span>
              </li>
            )}
          </ul>
        )}
      </DetailSheet>
    </>
  );
}

export default LookaheadWarnings;
