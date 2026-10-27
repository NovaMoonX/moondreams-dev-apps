import { join } from '@moondreamsdev/dreamer-ui/utils';

import { MaskedText } from '@apps/runway/components/MaskedText';
import { RANGE_END_WORDS } from '@apps/runway/constants';
import { getRangeEnd, type RangeSide } from '@apps/runway/engine/stance';
import type { MoneyRange, Stance } from '@apps/runway/types';
import { describeRange } from '@apps/runway/utils/rangeText';

interface RangeNoteProps {
  range: MoneyRange;
  /** The stance that picked the figure: the item's own, else the plan's. */
  stance: Stance;
  side: RangeSide;
  /** True when the item plans at its own stance rather than the plan's. */
  isOwnStance?: boolean;
  className?: string;
}

/** Says which end of a range a figure is planned at; draws nothing for an exact amount. */
function RangeNote({
  range,
  stance,
  side,
  isOwnStance = false,
  className,
}: RangeNoteProps) {
  const text = describeRange(range, stance, side, isOwnStance);
  if (text === null) return null;

  return (
    <span
      className={join('text-muted-foreground block', className ?? 'text-sm')}
    >
      <MaskedText>{text}</MaskedText>
    </span>
  );
}

interface RangeBasisNoteProps {
  stance: Stance;
  side: RangeSide;
  className?: string;
}

/** For a figure built from many amounts at once (a goal's pace): which end any range among them is planned at. */
export function RangeBasisNote({
  stance,
  side,
  className,
}: RangeBasisNoteProps) {
  return (
    <span
      className={join('text-muted-foreground block', className ?? 'text-sm')}
    >
      Any range of {side === 'income' ? 'pay' : 'bills'} is planned at{' '}
      {RANGE_END_WORDS[getRangeEnd(stance, side)]}.
    </span>
  );
}

export default RangeNote;
