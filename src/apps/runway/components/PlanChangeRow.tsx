import { useState } from 'react';

import { CalendarClock } from 'lucide-react';

import { useAppSelector } from '@/store';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { findLinkHolder } from '@apps/runway/engine/horizonLinks';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import {
  selectAllCards,
  selectAllHorizonItems,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describeChangeLine,
  getChangeRef,
} from '@apps/runway/utils/comingChangeText';

interface PlanChangeRowProps {
  change: PlanChange;
  today: number;
  /** The row's words when they should not be the default "Rent: $1,250 → $0 from Dec 1st" (a day's agenda says "Rent goes to $0"). */
  text?: string;
  /** The item's own list: the emoji is the sheet's own, so each row wears a plain calendar mark instead. */
  isOwnItem?: boolean;
  /** Opens the change somewhere other than its own item's sheet (a list inside that sheet). */
  onOpen?: () => void;
}

/** One planned change as a row that opens the change's own sheet on its item; the event it is part of, when there is one, is its one line of detail. */
function PlanChangeRow({
  change,
  today,
  text,
  isOwnItem = false,
  onOpen,
}: PlanChangeRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const mask = useMaskedText();
  const allCards = useAppSelector(selectAllCards);
  const events = useAppSelector((state) => selectAllHorizonItems(state, today));
  const words = mask(
    text ?? describeChangeLine(change, getCardNamer(allCards)),
  );
  const emoji =
    'emoji' in change.after.payload ? change.after.payload.emoji : null;
  const eventName =
    findLinkHolder(events, {
      changeId: getChangeRef(change).changeId,
      itemId: change.itemId,
    })?.version.payload.name ?? null;

  return (
    <>
      <ItemRow
        name={words}
        emoji={emoji}
        leading={
          isOwnItem ? (
            <span className='bg-accent text-accent-foreground grid size-9 place-items-center rounded-full'>
              <CalendarClock className='size-4' aria-hidden='true' />
            </span>
          ) : undefined
        }
        detail={eventName}
        ariaLabel={`${words}. Open`}
        onOpen={onOpen ?? (() => setIsOpen(true))}
      />
      {isOpen && (
        <ItemSheet
          itemId={change.itemId}
          kind={change.kind}
          today={today}
          presetChange={getChangeRef(change)}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default PlanChangeRow;
