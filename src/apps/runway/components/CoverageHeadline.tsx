import { formatCents } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { DRAFT_WORDS, HOME_WORDS } from '@apps/runway/constants';
import type { BillCoverage } from '@apps/runway/engine/coverage';

interface CoverageHeadlineProps {
  freeCents: number;
  moneyCents: number;
}

/** What the day's money leaves once every envelope has had its turn. */
function CoverageHeadline({ freeCents, moneyCents }: CoverageHeadlineProps) {
  const detail =
    freeCents > 0
      ? `Left from ${formatCents(moneyCents)} after the envelopes`
      : DRAFT_WORDS.nothingLeft;

  return (
    <div className='border-border bg-accent rounded-2xl border p-4'>
      <p className='text-muted-foreground text-sm font-medium'>
        {DRAFT_WORDS.freeToSpend}
      </p>
      <p className='text-3xl font-semibold tracking-tight tabular-nums'>
        {formatCents(freeCents)}
      </p>
      <p className='text-muted-foreground text-sm'>{detail}</p>
    </div>
  );
}

interface BillCoverageLineProps {
  coverage: BillCoverage;
  /** The name of the bill the first gap is for. */
  gapName: string | null;
}

/** How far bills are set aside. A bill with no income day left to set it aside is said as a gap in the plan, never as missing money. */
export function BillCoverageLine({ coverage, gapName }: BillCoverageLineProps) {
  if (coverage.kind === 'noBills') {
    return (
      <p className='text-muted-foreground text-sm'>{HOME_WORDS.noBills}</p>
    );
  }
  if (coverage.kind === 'covered') {
    return (
      <p className='text-sm font-medium'>
        Every bill is covered through {formatDateUTC(coverage.through)}
      </p>
    );
  }
  return (
    <div className='space-y-0.5'>
      {coverage.through !== null && (
        <p className='text-sm font-medium'>
          Every bill is covered through {formatDateUTC(coverage.through)}
        </p>
      )}
      <p className='text-muted-foreground text-sm'>
        {gapName ?? 'A bill'}, due {formatDateUTC(coverage.dueOn)}, has no
        income day before it to set it aside.
      </p>
    </div>
  );
}

export default CoverageHeadline;
