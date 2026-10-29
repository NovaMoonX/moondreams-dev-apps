import type { ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';

import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  CONFIRM_FLOW_WORDS,
  DRAFT_WORDS,
  HOME_WORDS,
  ITEM_SHEET_R2_WORDS,
} from '@apps/runway/constants';
import type { Lookahead } from '@apps/runway/engine/lookahead';

interface CoverageHeadlineProps {
  freeCents: number;
}

/** What the day's money leaves once every item has had its turn (less than nothing when the person covered the difference from Free to spend): its own framed block under the day's lines, in the card's neutral colour so the figure above it stays the one emphasized surface. */
function CoverageHeadline({ freeCents }: CoverageHeadlineProps) {
  const { isHidden } = useValuesHidden();
  return (
    <div className='border-border bg-card flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3 py-2'>
      <span className='min-w-0'>
        <span className='block font-medium'>{DRAFT_WORDS.dayLeft}</span>
        {freeCents < 0 && !isHidden && (
          <span className='text-muted-foreground block text-sm'>
            {CONFIRM_FLOW_WORDS.coveredDay}
          </span>
        )}
      </span>
      <span className='text-lg font-semibold whitespace-nowrap tabular-nums'>
        <SensitiveValue>{formatCents(freeCents)}</SensitiveValue>
      </span>
    </div>
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
  const date = formatDateShortUTC(lookahead.holdsThrough).replace(
    / /g,
    '\u00a0',
  );
  const isClear = lookahead.problems.length === 0;
  return (
    <div className='flex min-h-10 items-center gap-1'>
      {isClear && (
        <CircleCheck
          className='text-primary h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      )}
      <p className='text-sm font-medium text-balance'>
        {ITEM_SHEET_R2_WORDS.holdsThrough}{' '}
        <span className='whitespace-nowrap'>
          {date}
          {help && (
            <span className='ml-1 inline-flex align-middle'>{help}</span>
          )}
        </span>
      </p>
    </div>
  );
}

export default CoverageHeadline;
