import { useState } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import InlineNotice from '@/components/InlineNotice';
import DetailSheet from '@/components/DetailSheet';
import ShowMoreButton from '@/components/ShowMoreButton';
import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  FIX_ROWS_SHOWN,
  FIX_WORDS,
  PROBLEM_WORDS,
} from '@apps/runway/constants';
import {
  describeGroupShort,
  groupProblems,
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
  const [isAllShown, setIsAllShown] = useState(false);
  const groups = groupProblems(lookahead.problems);
  const first = groups[0] ?? null;
  const endsText =
    incomeEndsOn === null
      ? null
      : FIX_WORDS.incomeEnds(formatDateUTC(incomeEndsOn));

  if (!first && !endsText) return null;
  const label = first
    ? describeGroupShort(first)
    : { before: endsText ?? '', figure: null, after: '' };
  const more = groups.length - 1;
  const moreText = groups.every((group) => group.kind === 'day')
    ? `${more} more ${more === 1 ? 'day' : 'days'}`
    : `${more} more`;
  const isCounted = more > 0;
  const isLabelPrivate = label.figure !== null;
  const shown = isAllShown ? groups : groups.slice(0, FIX_ROWS_SHOWN);

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
          {isCounted && (
            <span className='sm:hidden'>
              {PROBLEM_WORDS.many(groups.length)}
            </span>
          )}
          <span className={join(isCounted && 'max-sm:hidden')}>
            {label.before}
            {label.figure !== null && (
              <SensitiveValue>{label.figure}</SensitiveValue>
            )}
            {label.after}
            {more > 0 && (
              <span className='text-muted-foreground font-normal whitespace-nowrap'>
                {' '}
                · {moreText}
              </span>
            )}
          </span>
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
        {isFixesOpen && groups.length > 0 && (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {shown.map((group) => (
              <li
                key={`${group.kind}:${group.on}:${group.kind === 'day' ? group.dayKey : group.problem.kind}`}
                className='first:[&>button]:rounded-t-2xl last:[&>button]:rounded-b-2xl'
              >
                <ProblemRow group={group} />
              </li>
            ))}
            {groups.length > FIX_ROWS_SHOWN && (
              <li className='px-3 py-1'>
                <ShowMoreButton
                  isOpen={isAllShown}
                  onClick={() => setIsAllShown((current) => !current)}
                >
                  {isAllShown
                    ? 'Show fewer'
                    : `Show ${groups.length - FIX_ROWS_SHOWN} more`}
                </ShowMoreButton>
              </li>
            )}
          </ul>
        )}
        {isFixesOpen && endsText !== null && (
          <InlineNotice tone='info' className='mt-3'>
            {endsText}
          </InlineNotice>
        )}
      </DetailSheet>
    </>
  );
}

export default LookaheadWarnings;
