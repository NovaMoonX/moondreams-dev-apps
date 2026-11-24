import { CalendarArrowUp, ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { NEXT_FILL_WORDS } from '@apps/runway/constants';
import { getNextFill } from '@apps/runway/engine/lookahead';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface NextFillRowProps {
  itemId: string;
  today: number;
}

/** The next income day that gives an envelope money, as a door to that day; nothing when no day in the coming year does. */
function NextFillRow({ itemId, today }: NextFillRowProps) {
  const mask = useMaskedText();
  const { openDay } = useRunwayUrlState();
  const lookahead = useDeferredLookahead(today, true);
  const fill = lookahead === null ? null : getNextFill(lookahead.steps, itemId);
  if (fill === null) return null;
  const text = NEXT_FILL_WORDS.row(
    formatCents(fill.cents),
    formatDateOrdinalUTC(fill.on),
  );

  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! border-border h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-2 text-left font-normal whitespace-normal'
      aria-label={`${mask(text)}. ${NEXT_FILL_WORDS.sub}`}
      onClick={() => afterBackLayersClose(() => openDay(fill.dayKey))}
    >
      <CalendarArrowUp
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1'>
        <span className='block text-[15px] leading-5 font-medium break-words'>
          {mask(text)}
        </span>
        <span className='text-muted-foreground block text-[13px]'>
          {NEXT_FILL_WORDS.sub}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default NextFillRow;
