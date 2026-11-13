import { CalendarClock, ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { COMING_WORDS } from '@apps/runway/constants';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describeComingHeadline } from '@apps/runway/utils/comingChangeText';

interface ComingChangesRowProps {
  /** In date order, never empty. */
  changes: readonly PlanChange[];
  eventNameOf: (change: PlanChange) => string | undefined;
  onOpenChange: (change: PlanChange) => void;
  onOpenList: () => void;
}

/** What is coming for an item, as a tinted row under its figure: the one change in words, or a count that opens the list. */
function ComingChangesRow({
  changes,
  eventNameOf,
  onOpenChange,
  onOpenList,
}: ComingChangesRowProps) {
  const mask = useMaskedText();
  const cardNamer = getCardNamer(useAppSelector(selectAllCards));
  const [first] = changes;
  if (!first) return null;
  const eventName = eventNameOf(first);
  const headline = describeComingHeadline(first, cardNamer);
  const text =
    changes.length === 1
      ? eventName
        ? COMING_WORDS.withEvent(headline, eventName)
        : headline
      : COMING_WORDS.many(changes.length, formatDateOrdinalUTC(first.on));

  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! border-primary/25 bg-accent hover:bg-accent/80 h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-2 text-left font-normal whitespace-normal'
      onClick={() =>
        changes.length === 1 ? onOpenChange(first) : onOpenList()
      }
    >
      <CalendarClock
        className='text-accent-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1 text-[15px] leading-5 font-medium text-pretty break-words'>
        {mask(text)}
      </span>
      <ChevronRight
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default ComingChangesRow;
