import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDateUTC } from '@/utils/formatUtils';
import { FIX_WORDS, PROBLEM_WORDS } from '@apps/runway/constants';
import {
  describeProblemShort,
  sortProblems,
} from '@apps/runway/utils/lookaheadText';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import ProblemRow from '@apps/runway/components/ProblemRow';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface LookaheadWarningsProps {
  lookahead: Lookahead;
}

/** What stops the plan, as one warning row that counts the rest; it opens "Things to fix", one row per problem, soonest first. The open list lives in the URL, so coming back from a row's day lands on it again. */
function LookaheadWarnings({ lookahead }: LookaheadWarningsProps) {
  const { isFixesOpen, openFixes, closeFixes } = useRunwayUrlState();
  const { isHidden } = useValuesHidden();
  const { incomeEndsOn } = lookahead;
  const problems = sortProblems(lookahead.problems);
  const first = problems[0] ?? null;
  const endsText =
    incomeEndsOn === null
      ? null
      : FIX_WORDS.incomeEnds(formatDateUTC(incomeEndsOn));

  if (!first && !endsText) return null;
  const label = first ? describeProblemShort(first) : endsText;
  const more = problems.length - 1;
  const isLabelPrivate = first?.kind === 'short';

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border border-(--runway-warning-edge) bg-(--runway-warning-soft) px-3! py-1.5 text-left font-normal whitespace-normal'
        aria-label={
          isHidden && isLabelPrivate
            ? `The plan falls short. Amount hidden${more > 0 ? `, ${more} more` : ''}. See what to fix`
            : undefined
        }
        onClick={openFixes}
      >
        <span
          className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
          aria-hidden='true'
        >
          <TriangleAlert className='h-4 w-4' />
        </span>
        <span className='min-w-0 flex-1 text-sm font-medium'>
          {isLabelPrivate ? <SensitiveValue>{label}</SensitiveValue> : label}
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
        isOpen={isFixesOpen}
        onClose={closeFixes}
        title={PROBLEM_WORDS.title}
      >
        {isFixesOpen && (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {problems.map((problem, index) => (
              <li
                key={`${index}:${problem.kind}:${problem.on}`}
                className='first:[&>button]:rounded-t-2xl last:[&>button]:rounded-b-2xl'
              >
                <ProblemRow problem={problem} />
              </li>
            ))}
            {endsText !== null && (
              <li className='text-muted-foreground p-3 text-sm'>{endsText}</li>
            )}
          </ul>
        )}
      </DetailSheet>
    </>
  );
}

export default LookaheadWarnings;
