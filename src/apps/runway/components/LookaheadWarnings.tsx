import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';

import ShowMoreButton from '@/components/ShowMoreButton';
import { formatCents } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  LOOKAHEAD_WARNINGS_PREVIEW,
  MAX_QUIET_HIDDEN,
} from '@apps/runway/constants';
import type { Lookahead, StanceCushion } from '@apps/runway/engine/lookahead';
import ProblemRow from '@apps/runway/components/ProblemRow';
import { describeProblem } from '@apps/runway/utils/lookaheadText';

interface LookaheadWarningsProps {
  lookahead: Lookahead;
  cushion: StanceCushion | null;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** What stops the plan, one row per problem, then the cushion the stance holds back. */
function LookaheadWarnings({ lookahead, cushion }: LookaheadWarningsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { problems, incomeEndsOn } = lookahead;
  const rows = [
    ...problems.map((problem) => ({
      key: `${problem.kind}:${problem.on}:${'billId' in problem ? problem.billId : problem.itemId}`,
      problem,
      text: describeProblem(problem),
    })),
    ...(incomeEndsOn === null
      ? []
      : [
          {
            key: 'incomeEnds',
            problem: null,
            text: `Your last income day is ${formatDateUTC(incomeEndsOn)}. Nothing is planned after it.`,
          },
        ]),
  ];
  const hasFold = rows.length > LOOKAHEAD_WARNINGS_PREVIEW + MAX_QUIET_HIDDEN;
  const shown =
    hasFold && !isOpen ? rows.slice(0, LOOKAHEAD_WARNINGS_PREVIEW) : rows;
  const cushionParts = cushion
    ? [
        cushion.sourceCount > 0 && plural(cushion.sourceCount, 'source'),
        cushion.billCount > 0 && plural(cushion.billCount, 'bill'),
      ].filter(Boolean)
    : [];

  if (rows.length === 0 && !cushion) return null;

  return (
    <div className='space-y-2'>
      {rows.length > 0 && (
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {shown.map((row) => (
            <li key={row.key}>
              {row.problem ? (
                <ProblemRow problem={row.problem} />
              ) : (
                <p className='flex items-start gap-3 p-3 text-sm'>
                  <TriangleAlert
                    className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='min-w-0 break-words'>{row.text}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasFold && (
        <ShowMoreButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)}>
          {isOpen
            ? 'Show fewer'
            : `Show ${rows.length - LOOKAHEAD_WARNINGS_PREVIEW} more`}
        </ShowMoreButton>
      )}
      {cushion && (
        <p className='text-muted-foreground text-sm'>
          Conservative planning is holding back {formatCents(cushion.cents)}
          {cushionParts.length > 0 && ` across ${cushionParts.join(' and ')}`}.
        </p>
      )}
    </div>
  );
}

export default LookaheadWarnings;
