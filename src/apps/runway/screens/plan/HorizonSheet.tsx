import { useState } from 'react';
import { HandCoins } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatDateRangeOrdinalUTC } from '@apps/runway/utils/horizonText';
import { formatCents } from '@/utils/moneyUtils';
import CostRow from '@apps/runway/components/CostRow';
import CoversLine from '@apps/runway/components/CoversLine';
import { MaskedText } from '@apps/runway/components/MaskedText';
import PutTowardView from '@apps/runway/components/PutTowardView';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  HORIZON_WORDS,
  LOOKAHEAD_MONTHS,
} from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  getHorizonFigures,
  listHorizonPayments,
  planHorizon,
  sumCostPayments,
} from '@apps/runway/engine/horizon';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import type { HorizonSealed, Stance } from '@apps/runway/types';

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
  const [isPutting, setIsPutting] = useState(false);
  const payments = listHorizonPayments(
    horizon.costs,
    addUtcMonths(today, LOOKAHEAD_MONTHS),
    stance,
  );
  const plannedCents = sumCostPayments(payments);
  const figures = getHorizonFigures(
    Math.max(0, balances.assignedByItem[itemId] ?? 0),
  );
  const plan = planHorizon(horizon, figures.leftCents, payments);
  const { shortfall } = plan;
  const when =
    horizon.happensUntil === null
      ? HORIZON_WORDS.around(formatDateOrdinalUTC(horizon.happensOn))
      : HORIZON_WORDS.aroundRange(
          formatDateRangeOrdinalUTC(horizon.happensOn, horizon.happensUntil),
        );
  const fact = [
    HORIZON_WORDS.totalCostIs(formatCents(plannedCents)).replaceAll(
      ' ',
      '\u00A0',
    ),
    HORIZON_WORDS.costCount(horizon.costs.length).replace(' ', '\u00A0'),
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
      {isPutting ? (
        <PutTowardView
          itemId={itemId}
          name={horizon.name}
          today={today}
          onBack={() => setIsPutting(false)}
        />
      ) : (
        <div className='space-y-4'>
          <SheetHead
            label={HORIZON_WORDS.left}
            figure={formatCents(figures.leftCents)}
            fact={HORIZON_WORDS.leftFact(
              formatCents(figures.setAsideCents),
              formatCents(figures.spentCents),
            )}
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
                  )}
                </MaskedText>
              }
            >
              <p>{HORIZON_WORDS.shortBody(horizon.name)}</p>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className='mt-2'
                onClick={() => setIsPutting(true)}
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
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<HandCoins />}
              label={HORIZON_WORDS.putMore}
              subtitle={HORIZON_WORDS.putMoreSub}
              onClick={() => setIsPutting(true)}
            />
          </ActionGroup>
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
