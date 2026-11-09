import { useState } from 'react';

import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { PLAN_CHANGE_WORDS } from '@apps/runway/constants';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getChangeRef } from '@apps/runway/utils/comingChangeText';
import { describePlanChange } from '@apps/runway/utils/planChangeText';

interface PlanChangeRowProps {
  change: PlanChange;
  today: number;
  /** The row's words when they should not be the default "Rent · $1,250 → $0" (a day's agenda says "Rent goes to $0"). */
  text?: string;
  /** Opens the change somewhere other than its own item's sheet (a list inside that sheet). */
  onOpen?: () => void;
}

/** One planned change as a row that opens the change's own sheet on its item. */
function PlanChangeRow({ change, today, text, onOpen }: PlanChangeRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const mask = useMaskedText();
  const words = mask(text ?? describePlanChange(change));
  const emoji =
    'emoji' in change.after.payload ? change.after.payload.emoji : null;
  const date = formatDateOrdinalUTC(change.startsOn);

  return (
    <>
      <ItemRow
        name={words}
        emoji={emoji}
        detail={PLAN_CHANGE_WORDS.fromDate(date)}
        ariaLabel={`${words}. Open`}
        onOpen={onOpen ?? (() => setIsOpen(true))}
      />
      {isOpen && (
        <ItemSheet
          itemId={change.itemId}
          kind={change.kind}
          today={today}
          figureLabel={PLAN_CHANGE_WORDS.sheetLabel}
          presetChange={getChangeRef(change)}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default PlanChangeRow;
