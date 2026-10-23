import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import Subview from '@/components/Subview';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { useAppSelector } from '@/store';
import { HOME_WORDS } from '@apps/runway/constants';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import StartingAmountsSheet from '@apps/runway/forms/StartingAmountsSheet';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';

interface FreeToSpendScreenProps {
  onClose: () => void;
}

/** Free to spend in detail: the money on hand and what has a job, so the figure can be followed to its parts. */
function FreeToSpendScreen({ onClose }: FreeToSpendScreenProps) {
  const balances = useAppSelector(selectBalances);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [sheetKey, setSheetKey] = useState<number | null>(null);
  const figure = getFreeToSpendFigure(balances);
  const free = describeFreeToSpend(figure);
  const rows: [string, string][] = [
    ['Money on hand', formatCents(balances.moneyOnHandCents)],
    ['Assigned to bills', formatCents(balances.assignedToBillsCents)],
    ['Assigned to goals', formatCents(balances.assignedToGoalsCents)],
    ['Assigned to envelopes', formatCents(balances.assignedToEnvelopesCents)],
  ];

  return (
    <Subview title={HOME_WORDS.freeToSpend} onClose={onClose}>
      {!isLedgerReady ? (
        <p className='text-muted-foreground text-sm'>Getting your plan.</p>
      ) : (
        <div className='space-y-4'>
          <div className='border-border bg-accent rounded-2xl border p-4'>
            <p className='text-muted-foreground text-sm font-medium'>
              {free.label}
            </p>
            <p className='text-3xl font-semibold tracking-tight tabular-nums'>
              {free.value}
            </p>
            {startDate !== null && (
              <p className='text-muted-foreground text-sm'>
                Counted from {formatDateUTC(startDate)}
              </p>
            )}
          </div>
          {figure.kind === 'unknown' ? (
            <p className='text-muted-foreground text-sm'>
              {HOME_WORDS.notSetHint}
            </p>
          ) : (
            <dl className='border-border bg-card divide-border divide-y rounded-2xl border'>
              {rows.map(([name, value]) => (
                <div
                  key={name}
                  className='flex items-start justify-between gap-3 p-3'
                >
                  <dt className='min-w-0 text-sm'>{name}</dt>
                  <dd className='font-medium whitespace-nowrap tabular-nums'>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <Button
            variant='secondary'
            onClick={() => setSheetKey((current) => (current ?? 0) + 1)}
          >
            {startDate === null
              ? 'Say where things stand'
              : 'Change what you started with'}
          </Button>
          {sheetKey !== null && (
            <StartingAmountsSheet
              key={sheetKey}
              isOpen
              onClose={() => setSheetKey(null)}
            />
          )}
        </div>
      )}
    </Subview>
  );
}

export default FreeToSpendScreen;
