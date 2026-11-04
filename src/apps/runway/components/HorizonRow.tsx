import { useState } from 'react';

import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import { HORIZON_WORDS } from '@apps/runway/constants';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import type { HorizonSealed, Stance } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

interface HorizonRowProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
}

/** An event in the plan: its badge, name, a shortfall or the next cost due, and what is left of the money put toward it; it opens the event's sheet. */
function HorizonRow({ itemId, horizon, today, stance }: HorizonRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isHidden } = useValuesHidden();
  const balances = useAppSelector(selectBalances);
  const { figures, plan, next } = getHorizonStatus(
    horizon,
    balances.assignedByItem[itemId] ?? 0,
    today,
    stance,
  );
  const { shortfall } = plan;
  const getDetail = () => {
    if (shortfall) {
      return isHidden
        ? HORIZON_WORDS.needsAShortLook
        : HORIZON_WORDS.shortTitle(
            formatCentsShort(shortfall.shortCents),
            formatDateOrdinalUTC(shortfall.dueOn),
          );
    }
    return next
      ? HORIZON_WORDS.due(next.name, formatDateOrdinalUTC(next.dueOn))
      : HORIZON_WORDS.nothingDue;
  };
  const detail = getDetail();
  const left = formatCentsShort(figures.leftCents);

  return (
    <>
      <ItemRow
        name={horizon.name}
        emoji={horizon.emoji}
        detail={detail}
        isDetailWarning={shortfall !== null && !isHidden}
        figure={left}
        ariaLabel={`${horizon.name}, ${left} left. ${detail}. Open`}
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
