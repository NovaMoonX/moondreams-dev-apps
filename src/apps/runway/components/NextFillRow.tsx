import { CalendarArrowUp, ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import OverCoverStrip from '@apps/runway/components/OverCoverStrip';
import { NEXT_FILL_WORDS } from '@apps/runway/constants';
import { getNextFill } from '@apps/runway/engine/lookahead';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import type { Cents } from '@apps/runway/types';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface NextFillRowProps {
  itemId: string;
  name: string;
  today: number;
  /** What the envelope holds now. */
  heldCents: Cents;
  /** Draws the door to the next income day; off when the sheet was opened from a day. */
  hasDoor: boolean;
  /** Offers to bring an envelope below zero back to $0 from Free to Spend. */
  canCover: boolean;
}

/** An envelope's next income day as a door to it, said as when the envelope stops being over when it is below zero, with covering it now as a quiet choice under it. */
function NextFillRow({
  itemId,
  name,
  today,
  heldCents,
  hasDoor,
  canCover,
}: NextFillRowProps) {
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const { openDay } = useRunwayUrlState();
  const lookahead = useDeferredLookahead(today, hasDoor);
  const fill =
    !hasDoor || lookahead === null
      ? null
      : getNextFill(lookahead.steps, itemId);
  const isOver = heldCents < 0 && !isHidden;
  const hasStrip = isOver && canCover;
  if (fill === null && !hasStrip)
    return heldCents < 0 && isHidden && canCover ? <NeedsALookRow /> : null;

  const getWords = (on: number, cents: Cents) => {
    const date = formatDateOrdinalUTC(on);
    const amount = formatCents(cents);
    if (!isOver)
      return {
        title: NEXT_FILL_WORDS.row(amount, date),
        sub: NEXT_FILL_WORDS.sub,
      };
    const afterCents = heldCents + cents;
    if (afterCents < 0)
      return {
        title: NEXT_FILL_WORDS.row(amount, date),
        sub: NEXT_FILL_WORDS.stillOver(formatCents(-afterCents)),
      };
    return {
      title: NEXT_FILL_WORDS.overUntil(date),
      sub: NEXT_FILL_WORDS.leaving(amount, formatCents(afterCents)),
    };
  };
  const words = fill === null ? null : getWords(fill.on, fill.cents);

  return (
    <div className='space-y-2'>
      {heldCents < 0 && isHidden && canCover && <NeedsALookRow />}
      <div className='border-border overflow-hidden rounded-2xl border'>
        {fill !== null && words !== null && (
          <Button
            type='button'
            variant='tertiary'
            className='text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-none px-3! py-2 text-left font-normal whitespace-normal'
            aria-label={`${mask(words.title)}. ${mask(words.sub)}`}
            onClick={() => afterBackLayersClose(() => openDay(fill.dayKey))}
          >
            {isOver ? (
              <TriangleAlert
                className='text-warning h-4 w-4 shrink-0'
                aria-hidden='true'
              />
            ) : (
              <CalendarArrowUp
                className='text-muted-foreground h-4 w-4 shrink-0'
                aria-hidden='true'
              />
            )}
            <span className='min-w-0 flex-1'>
              <span className='block text-[15px] leading-5 font-medium break-words'>
                {mask(words.title)}
              </span>
              <span className='text-muted-foreground block text-[13px]'>
                {mask(words.sub)}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground h-4 w-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        )}
        {hasStrip && (
          <OverCoverStrip
            itemId={itemId}
            name={name}
            heldCents={heldCents}
            isAlone={fill === null}
          />
        )}
      </div>
    </div>
  );
}

export default NextFillRow;
