import { formatCents } from '@/utils/moneyUtils';
import { DRAFT_WORDS } from '@apps/runway/constants';

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

export default CoverageHeadline;
