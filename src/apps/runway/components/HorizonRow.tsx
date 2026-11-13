import { useState } from 'react';

import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import {
  getChangesOnlyDoneOn,
  getLinkSpan,
} from '@apps/runway/engine/horizonLinks';
import ItemRow, { type ItemRowReorder } from '@apps/runway/components/ItemRow';
import { HORIZON_END_WORDS, HORIZON_WORDS } from '@apps/runway/constants';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';
import { selectGoalCovers } from '@apps/runway/store/selectors/overviewSelectors';
import {
  selectCostPaid,
  selectItemEnds,
  selectItemStops,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonSealed, Stance } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

interface HorizonRowProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
  /** Set while the priorities list is being reordered. */
  reorder?: ItemRowReorder;
  isHighlighted?: boolean;
  /** The dial counts none of the event's costs: its badge and figure dim. */
  isFaded?: boolean;
  /** Opens the sheet from outside the row, so it stays up when the event moves to another list. */
  onOpenItem?: (itemId: string) => void;
}

/** An event in the plan: its badge, name, a shortfall or the next cost due, and what is left of the money put toward it; it opens the event's sheet. */
function HorizonRow({
  itemId,
  horizon,
  today,
  stance,
  reorder,
  isHighlighted = false,
  isFaded = false,
  onOpenItem,
}: HorizonRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isHidden } = useValuesHidden();
  const balances = useAppSelector(selectBalances);
  const paid = useAppSelector(selectCostPaid)[itemId];
  const goalCover =
    useAppSelector((state) => selectGoalCovers(state, today))[itemId] ?? null;
  const { figures, plan, next } = getHorizonStatus(
    horizon,
    balances.assignedByItem[itemId] ?? 0,
    today,
    stance,
    paid,
    balances.costPaidByItem[itemId] ?? 0,
    balances.costFromFreeByItem[itemId] ?? 0,
    goalCover,
  );
  const { shortfall } = plan;
  const isDone = horizon.state !== 'open';
  const versions = useAppSelector((state) => state.runway.versions);
  const stops = useAppSelector(selectItemStops);
  const ends = useAppSelector(selectItemEnds);
  const isChangesOnly = horizon.costs.length === 0;
  const isChangesDone =
    getChangesOnlyDoneOn(horizon, versions, today, stops, ends) !== null;
  const getDetail = () => {
    if (isChangesOnly && !isDone) {
      if (isChangesDone) return HORIZON_WORDS.changesHappened;
      const count = horizon.links.filter(
        (link) => getLinkSpan(versions, link, stops, ends)?.isLive,
      ).length;
      return count === 0
        ? HORIZON_WORDS.noChangesYet
        : HORIZON_WORDS.changesCount(count);
    }
    if (isDone) {
      const on = formatDateOrdinalUTC(horizon.stateOn ?? horizon.happensOn);
      return horizon.state === 'calledOff'
        ? HORIZON_END_WORDS.calledOffOn(on)
        : HORIZON_END_WORDS.doneOn(on);
    }
    if (shortfall) {
      return isHidden
        ? HORIZON_WORDS.needsAShortLook
        : HORIZON_WORDS.shortTitle(
            formatCentsShort(shortfall.shortCents),
            formatDateOrdinalUTC(shortfall.dueOn),
            shortfall.totalShortCents > shortfall.shortCents
              ? formatCentsShort(
                  shortfall.totalShortCents - shortfall.shortCents,
                )
              : null,
          );
    }
    if (
      horizon.rest.kind === 'pays' &&
      horizon.rest.startsOn !== null &&
      horizon.rest.startsOn > today &&
      figures.leftCents === 0
    ) {
      return HORIZON_WORDS.savingStarts(
        formatDateOrdinalUTC(horizon.rest.startsOn),
      );
    }
    return next
      ? HORIZON_WORDS.due(next.name, formatDateOrdinalUTC(next.dueOn))
      : HORIZON_WORDS.nothingDue;
  };
  const baseDetail = getDetail();
  const detail =
    horizon.isYearly && !isDone
      ? `${baseDetail} · ${HORIZON_WORDS.everyYear}`
      : baseDetail;
  const left = formatCentsShort(
    isDone ? figures.spentCents : figures.leftCents,
  );

  return (
    <>
      <ItemRow
        name={horizon.name}
        emoji={horizon.emoji}
        detail={detail}
        isDetailWarning={shortfall !== null && !isHidden && !isFaded}
        figure={isChangesOnly ? null : left}
        figureWord={
          isDone
            ? horizon.state === 'calledOff'
              ? HORIZON_END_WORDS.paid
              : HORIZON_END_WORDS.spent
            : null
        }
        ariaLabel={
          isChangesOnly
            ? `${horizon.name}. ${detail}. Open`
            : `${horizon.name}, ${left} ${isDone ? 'spent' : 'left'}. ${detail}. Open`
        }
        onOpen={
          reorder
            ? undefined
            : () => (onOpenItem ? onOpenItem(itemId) : setIsOpen(true))
        }
        isFigureMuted={isDone}
        reorder={reorder}
        isHighlighted={isHighlighted}
        isFaded={isFaded}
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
