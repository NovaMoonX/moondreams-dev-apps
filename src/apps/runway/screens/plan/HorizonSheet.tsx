import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatDateRangeOrdinalUTC } from '@apps/runway/utils/horizonText';
import { formatCents } from '@/utils/moneyUtils';
import CostRow from '@apps/runway/components/CostRow';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  HORIZON_WORDS,
  LOOKAHEAD_MONTHS,
  RANGE_END_WORDS,
} from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  listHorizonPayments,
  sumCostPayments,
} from '@apps/runway/engine/horizon';
import { getRangeEnd } from '@apps/runway/engine/stance';
import type { HorizonSealed, Stance } from '@apps/runway/types';

interface HorizonSheetProps {
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
  onClose: () => void;
}

/** One event: what its costs add up to, then the costs by date. */
function HorizonSheet({ horizon, today, stance, onClose }: HorizonSheetProps) {
  const plannedCents = sumCostPayments(
    listHorizonPayments(
      horizon.costs,
      addUtcMonths(today, LOOKAHEAD_MONTHS),
      stance,
    ),
  );
  const hasRange = horizon.costs.some(
    ({ amount }) => amount.lowCents !== amount.highCents,
  );
  const when =
    horizon.happensUntil === null
      ? HORIZON_WORDS.around(formatDateOrdinalUTC(horizon.happensOn))
      : HORIZON_WORDS.aroundRange(
          formatDateRangeOrdinalUTC(horizon.happensOn, horizon.happensUntil),
        );
  const fact = [
    HORIZON_WORDS.costCount(horizon.costs.length).replace(' ', '\u00A0'),
    hasRange &&
      HORIZON_WORDS.rangesAt(RANGE_END_WORDS[getRangeEnd(stance, 'expense')]),
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
      <div className='space-y-4'>
        <SheetHead
          label={HORIZON_WORDS.totalCost}
          figure={formatCents(plannedCents)}
          fact={fact}
        />
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
    </FormSheet>
  );
}

export default HorizonSheet;
