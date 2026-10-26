import { formatCents } from '@/utils/moneyUtils';
import { DRAFT_WORDS, HOME_WORDS } from '@apps/runway/constants';
import { useAppSelector } from '@/store';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import { selectStance } from '@apps/runway/store/selectors/runwaySelectors';
import ProblemRow from '@apps/runway/components/ProblemRow';
import { describeHoldsThrough } from '@apps/runway/utils/lookaheadText';
import { describeRangeBasis } from '@apps/runway/utils/rangeText';

interface CoverageHeadlineProps {
  freeCents: number;
  moneyCents: number;
}

/** What the day's money leaves once every envelope has had its turn. */
function CoverageHeadline({ freeCents, moneyCents }: CoverageHeadlineProps) {
  const detail =
    freeCents > 0
      ? `Of ${formatCents(moneyCents)} after the envelopes`
      : DRAFT_WORDS.nothingLeft;

  return (
    <div className='border-border bg-accent rounded-2xl border p-4'>
      <p className='text-muted-foreground text-sm font-medium'>
        {DRAFT_WORDS.dayLeft}
      </p>
      <p className='text-3xl font-semibold tracking-tight tabular-nums'>
        {formatCents(freeCents)}
      </p>
      <p className='text-muted-foreground text-sm'>{detail}</p>
    </div>
  );
}

interface HoldsThroughLineProps {
  lookahead: Lookahead;
  /** Which sides of the plan have a range in them, so the line says which end it plans at. */
  rangeSides: { income: boolean; expense: boolean };
  /** True on Home, which names only the first problem; Days lists them all. */
  isFirstProblemShown?: boolean;
  /** False where each row already says which end it is planned at (Days). */
  hasRangeNote?: boolean;
}

/** How far the plan holds. A gap is said as a gap in the plan, never as missing money. */
export function HoldsThroughLine({
  lookahead,
  rangeSides,
  isFirstProblemShown = false,
  hasRangeNote = true,
}: HoldsThroughLineProps) {
  const stance = useAppSelector(selectStance);
  if (!lookahead.hasBills) {
    return (
      <p className='text-muted-foreground text-sm'>{HOME_WORDS.noBills}</p>
    );
  }
  const headline = describeHoldsThrough(lookahead);
  const first = lookahead.problems[0] ?? null;
  return (
    <div className='space-y-0.5'>
      {headline && <p className='text-sm font-medium'>{headline}</p>}
      {isFirstProblemShown && first && (
        <div className='border-border bg-card rounded-2xl border'>
          <ProblemRow problem={first} />
        </div>
      )}
      {hasRangeNote && (rangeSides.income || rangeSides.expense) && (
        <span className='text-muted-foreground block text-xs'>
          {describeRangeBasis(stance, rangeSides)}
        </span>
      )}
    </div>
  );
}

export default CoverageHeadline;
