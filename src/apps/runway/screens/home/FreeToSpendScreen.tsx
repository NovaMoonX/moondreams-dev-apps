import { useState } from 'react';

import { Calculator, Wallet } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';

import Subview from '@/components/Subview';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { useAppSelector } from '@/store';
import {
  CHECK_WORDS,
  ENVELOPE_SPEND_WORDS,
  HOME_WORDS,
} from '@apps/runway/constants';
import { leaveAfterSubviewCloses } from '@apps/runway/utils/leaveAfterClose';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import StartingAmountsSheet from '@apps/runway/forms/StartingAmountsSheet';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { getLevelWords } from '@apps/runway/utils/levelText';
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
  const level = useAppSelector(selectLevel);
  const words = getLevelWords(level);
  const { openCheckAmount } = useRunwayUrlState();
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
    [words.envelopesRow, formatCents(balances.assignedToEnvelopesCents)],
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
            <p className='text-4xl font-semibold tracking-tight tabular-nums'>
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
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Wallet />}
              label={
                startDate === null
                  ? 'Say where things stand'
                  : 'Change what you started with'
              }
              onClick={() => setSheetKey((current) => (current ?? 0) + 1)}
            />
            {level === 'track' && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Calculator />}
                label={CHECK_WORDS.open}
                subtitle={ENVELOPE_SPEND_WORDS.checkSub}
                onClick={() => {
                  onClose();
                  leaveAfterSubviewCloses(() => openCheckAmount(null));
                }}
              />
            )}
          </ActionGroup>
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
