import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import CostRow from '@apps/runway/components/CostRow';
import SheetHead from '@apps/runway/components/SheetHead';
import { HORIZON_WORDS, LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  listHorizonPayments,
  sumCostPayments,
} from '@apps/runway/engine/horizon';
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
          label={HORIZON_WORDS.planned}
          figure={formatCents(plannedCents)}
          fact={
            horizon.happensUntil === null
              ? HORIZON_WORDS.around(formatDateOrdinalUTC(horizon.happensOn))
              : HORIZON_WORDS.aroundRange(
                  formatDateOrdinalUTC(horizon.happensOn),
                  formatDateOrdinalUTC(horizon.happensUntil),
                )
          }
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
