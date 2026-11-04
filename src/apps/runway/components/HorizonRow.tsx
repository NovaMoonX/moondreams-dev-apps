import { useState } from 'react';

import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import { HORIZON_WORDS, LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  listHorizonPayments,
  sumCostPayments,
} from '@apps/runway/engine/horizon';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import type { HorizonSealed, Stance } from '@apps/runway/types';

interface HorizonRowProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
}

/** An event in the plan: its badge, name, the next cost due and what its costs add up to; it opens the event's sheet. */
function HorizonRow({ itemId, horizon, today, stance }: HorizonRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const payments = listHorizonPayments(
    horizon.costs,
    addUtcMonths(today, LOOKAHEAD_MONTHS),
    stance,
  );
  const next = payments.find(({ dueOn }) => dueOn >= today);
  const nextCost = horizon.costs.find(({ id }) => id === next?.costId);
  const detail =
    next && nextCost
      ? HORIZON_WORDS.due(nextCost.name, formatDateOrdinalUTC(next.dueOn))
      : HORIZON_WORDS.nothingDue;
  const plannedCents = sumCostPayments(payments);

  return (
    <>
      <ItemRow
        name={horizon.name}
        emoji={horizon.emoji}
        detail={detail}
        figure={formatCentsShort(plannedCents)}
        ariaLabel={`${horizon.name}, ${formatCentsShort(plannedCents)} total cost. ${detail}. Open`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <HorizonSheet
          itemId={itemId}
          horizon={horizon}
          today={today}
          stance={stance}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default HorizonRow;
