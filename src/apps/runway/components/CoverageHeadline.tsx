import type { ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';

import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  DRAFT_WORDS,
  HOME_WORDS,
  ITEM_SHEET_R2_WORDS,
} from '@apps/runway/constants';
import type { Lookahead } from '@apps/runway/engine/lookahead';

interface CoverageHeadlineProps {
  freeCents: number;
}

/** What the day's money leaves once every line has had its turn, as the last row of the day's lines. */
function CoverageHeadline({ freeCents }: CoverageHeadlineProps) {
  return (
    <li className='bg-accent flex min-h-12 items-center justify-between gap-3 rounded-b-2xl px-3 py-2'>
      <span className='font-medium'>{DRAFT_WORDS.dayLeft}</span>
      <span className='text-lg font-semibold whitespace-nowrap tabular-nums'>
        {formatCents(freeCents)}
      </span>
    </li>
  );
}

interface HoldsThroughLineProps {
  lookahead: Lookahead;
  /** A help icon at the end of the line, for what the figure leaves out. */
  help?: ReactNode;
}

/** How far the plan holds, in one line. A gap is said as a gap in the plan, never as missing money. */
export function HoldsThroughLine({ lookahead, help }: HoldsThroughLineProps) {
  if (!lookahead.hasBills) {
    return (
      <p className='text-muted-foreground text-sm'>{HOME_WORDS.noBills}</p>
    );
  }
  if (lookahead.holdsThrough === null) return null;
  const headline = `${ITEM_SHEET_R2_WORDS.holdsThrough} ${formatDateShortUTC(lookahead.holdsThrough).replace(/ /g, '\u00a0')}`;
  const isClear = lookahead.problems.length === 0;
  return (
    <div className='flex min-h-10 items-center gap-1'>
      {isClear && (
        <CircleCheck
          className='text-primary h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      )}
      <p className='text-sm font-medium'>{headline}</p>
      {help}
    </div>
  );
}

export default CoverageHeadline;
