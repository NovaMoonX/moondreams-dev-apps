import { useState } from 'react';

import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { DAY_MS } from '@apps/runway/engine/dates';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { PLAN_CHANGE_WORDS } from '@apps/runway/constants';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { describePlanChange } from '@apps/runway/utils/planChangeText';

interface PlanChangeRowProps {
  change: PlanChange;
  today: number;
}

/** One planned change as a row ("Rent · $1,250 → $0", "Gym returns to $40") that opens the item's sheet. */
function PlanChangeRow({ change, today }: PlanChangeRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const mask = useMaskedText();
  const text = mask(describePlanChange(change));
  const emoji =
    'emoji' in change.after.payload ? change.after.payload.emoji : null;
  const date = formatDateOrdinalUTC(change.startsOn);
  const getFact = () => {
    if (change.what === 'stop')
      return PLAN_CHANGE_WORDS.sheetFactStops(
        formatDateOrdinalUTC(change.startsOn - DAY_MS),
      );
    return change.isReturn
      ? PLAN_CHANGE_WORDS.sheetFactReturns(date)
      : PLAN_CHANGE_WORDS.sheetFact(date);
  };

  return (
    <>
      <ItemRow
        name={text}
        emoji={emoji}
        detail={PLAN_CHANGE_WORDS.fromDate(date)}
        ariaLabel={`${text}. Open`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <ItemSheet
          itemId={change.itemId}
          kind={change.kind}
          today={today}
          figureLabel={PLAN_CHANGE_WORDS.sheetLabel}
          fact={getFact()}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default PlanChangeRow;
