import { useState } from 'react';
import { HandCoins } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatDateRangeOrdinalUTC } from '@apps/runway/utils/horizonText';
import { formatCents } from '@/utils/moneyUtils';
import CostRow from '@apps/runway/components/CostRow';
import CoversLine from '@apps/runway/components/CoversLine';
import { MaskedText } from '@apps/runway/components/MaskedText';
import PutTowardView from '@apps/runway/components/PutTowardView';
import SheetHead from '@apps/runway/components/SheetHead';
import { HORIZON_WORDS, RANGE_END_WORDS } from '@apps/runway/constants';
import { getRangeEnd } from '@apps/runway/engine/stance';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import type { HorizonSealed, Stance } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

interface HorizonSheetProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
  onClose: () => void;
}

/** One event: what is left of the money put toward it, what that covers, then the costs by date. */
function HorizonSheet({
  itemId,
  horizon,
  today,
  stance,
  onClose,
}: HorizonSheetProps) {
  const balances = useAppSelector(selectBalances);
  const { isHidden } = useValuesHidden();
  const [putting, setPutting] = useState<{
    initialCents: number | null;
  } | null>(null);
  const {
    figures,
    plan,
    plannedCents,
    plannedHighCents,
    isPlannedRange,
    outsideCents,
    hasRepeats,
  } = getHorizonStatus(
    horizon,
    balances.assignedByItem[itemId] ?? 0,
    today,
    stance,
  );
  const { shortfall } = plan;
  // While hidden every item keeps the same lines, so a missing line never tells an empty balance.
  const getShortBody = () => {
    if (!shortfall) return '';
    if (figures.leftCents <= 0 && !isHidden) {
      return HORIZON_WORDS.shortNothing(horizon.name);
    }
    const cost = horizon.costs.find(({ id }) => id === shortfall.costId);
    if (!cost) return '';
    const isRange = cost.amount.lowCents !== cost.amount.highCents;
    const index = plan.covers.findIndex(
      ({ costId, dueOn }) =>
        costId === shortfall.costId && dueOn === shortfall.dueOn,
    );
    const earlier =
      index > 0
        ? horizon.costs.find(({ id }) => id === plan.covers[index - 1].costId)
        : undefined;
    if (shortfall.availableCents === 0 && earlier) {
      return HORIZON_WORDS.shortAfter(cost.name, earlier.name);
    }
    return HORIZON_WORDS.shortBody(
      cost.name,
      formatCents(shortfall.paymentCents),
      formatCents(shortfall.availableCents),
      index > 0,
      isRange ? RANGE_END_WORDS[getRangeEnd(stance, 'expense')] : null,
    );
  };
  const when =
    horizon.happensUntil === null
      ? HORIZON_WORDS.around(formatDateOrdinalUTC(horizon.happensOn))
      : HORIZON_WORDS.aroundRange(
          formatDateRangeOrdinalUTC(horizon.happensOn, horizon.happensUntil),
        );
  const yearWords = hasRepeats ? HORIZON_WORDS.overNextYear : '';
  const fact = [
    HORIZON_WORDS.plannedTotal(
      formatCents(isPlannedRange ? plannedHighCents : plannedCents),
      isPlannedRange,
    ).replaceAll(' ', '\u00A0') + (outsideCents > 0 ? '' : yearWords),
    outsideCents > 0 &&
      HORIZON_WORDS.outsideTotal(formatCents(outsideCents)).replaceAll(
        ' ',
        '\u00A0',
      ) + yearWords,
    when,
  ]
    .filter(Boolean)
    .map((piece, index, pieces) =>
      index < pieces.length - 1 ? `${piece}\u00A0·` : piece,
    )
    .join(' ');
  const costs = [...horizon.costs].sort(
    (a, b) => (a.schedule.anchor ?? 0) - (b.schedule.anchor ?? 0),
  );

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={horizon.name}
      actions={<ValuesEyeButton />}
    >
      {putting ? (
        <PutTowardView
          itemId={itemId}
          name={horizon.name}
          today={today}
          initialCents={putting.initialCents}
          onBack={() => setPutting(null)}
        />
      ) : (
        <div className='space-y-4'>
          <SheetHead
            label={HORIZON_WORDS.left}
            figure={formatCents(figures.leftCents)}
            fact={
              figures.setAsideCents === 0 && !isHidden
                ? null
                : HORIZON_WORDS.leftFact(
                    formatCents(figures.setAsideCents),
                    formatCents(figures.spentCents),
                  )
            }
          />
          <CoversLine
            plan={plan}
            costs={horizon.costs}
            heldCents={figures.leftCents}
            stance={stance}
          />
          {shortfall && (
            <InlineNotice
              tone='warning'
              title={
                <MaskedText>
                  {HORIZON_WORDS.shortTitle(
                    formatCents(shortfall.shortCents),
                    formatDateOrdinalUTC(shortfall.dueOn),
                    shortfall.totalShortCents > shortfall.shortCents
                      ? formatCents(
                          shortfall.totalShortCents - shortfall.shortCents,
                        )
                      : null,
                  )}
                </MaskedText>
              }
            >
              <p>
                <MaskedText>{getShortBody()}</MaskedText>
              </p>
              <Button
                type='button'
                variant='primary'
                size='sm'
                className='mt-2'
                onClick={() =>
                  setPutting({ initialCents: shortfall.shortCents })
                }
              >
                {HORIZON_WORDS.putMore}
              </Button>
            </InlineNotice>
          )}
          {horizon.rest.kind === 'outside' && plan.coveredUntil !== null && (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.restOutsideNote}
            </p>
          )}
          {!shortfall && (
            <ActionGroup isRoomy>
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<HandCoins />}
                label={HORIZON_WORDS.putMore}
                subtitle={HORIZON_WORDS.putMoreSub}
                onClick={() => setPutting({ initialCents: null })}
              />
            </ActionGroup>
          )}
          <p className='text-muted-foreground text-sm'>
            <MaskedText>{fact}</MaskedText>
          </p>
          <div className='space-y-2'>
            <p className='text-muted-foreground text-sm font-medium'>
              {HORIZON_WORDS.costsCaption}
            </p>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {costs.map((cost) => (
                <CostRow key={cost.id} cost={cost} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </FormSheet>
  );
}

export default HorizonSheet;
