import { useState } from 'react';

import { Calculator, ChevronRight, Landmark, Wallet } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';

import HelpTip from '@/components/HelpTip';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { useAppSelector } from '@/store';
import {
  BALANCE_CHECK_WORDS,
  CARD_WORDS,
  CHECK_WORDS,
  ENVELOPE_SPEND_WORDS,
  FREE_SUM_WORDS,
  HOME_WORDS,
} from '@apps/runway/constants';
import { CheckAmountBody } from '@apps/runway/screens/home/CheckAmountScreen';
import { CheckBalanceBody } from '@apps/runway/screens/home/CheckBalanceScreen';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import StartingAmountsSheet from '@apps/runway/forms/StartingAmountsSheet';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { canChangeStart } from '@apps/runway/utils/startingCorrection';
import type { PlanSection } from '@apps/runway/types';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';

interface FreeToSpendScreenProps {
  onClose: () => void;
}

interface SumRow {
  sign: string;
  name: string;
  value: string;
  section?: PlanSection;
  /** What the row counts, behind an info icon beside its name. */
  help?: string;
  isResult?: boolean;
}

/** Free to Spend in detail: the money on hand and what has a job, so the figure can be followed to its parts. */
function FreeToSpendScreen({ onClose }: FreeToSpendScreenProps) {
  const balances = useAppSelector(selectBalances);
  const level = useAppSelector(selectLevel);
  const {
    view,
    checkEnvelope,
    openCheckAmount,
    closeCheckAmount,
    openCheckBalance,
    closeCheckBalance,
    leaveViewForTab,
  } = useRunwayUrlState();
  const isChecking = view === 'checkAmount';
  const isCheckingBalance = view === 'checkBalance';
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [sheetKey, setSheetKey] = useState<number | null>(null);
  const hasCards = useAppSelector(
    (state) => state.runway.cards.length > 0 && selectLevel(state) === 'track',
  );
  const figure = getFreeToSpendFigure(balances);
  const free = describeFreeToSpend(figure);
  const rows: SumRow[] = [
    {
      sign: '',
      name: FREE_SUM_WORDS.onHand,
      value: formatCents(balances.moneyOnHandCents),
      help: hasCards ? CARD_WORDS.freeOnHandHelp : undefined,
    },
    {
      sign: '−',
      name: FREE_SUM_WORDS.bills,
      value: formatCents(balances.assignedToBillsCents),
      section: 'bills',
    },
    {
      sign: '−',
      name: FREE_SUM_WORDS.goals,
      value: formatCents(balances.assignedToGoalsCents),
      section: 'goals',
    },
    {
      sign: '−',
      name:
        level === 'track'
          ? FREE_SUM_WORDS.envelopesTrack
          : FREE_SUM_WORDS.envelopesPlan,
      value: formatCents(balances.assignedToEnvelopesCents),
      section: 'envelopes',
    },
    ...(hasCards
      ? [
          {
            sign: '−',
            name: CARD_WORDS.freeWaiting,
            value: formatCents(balances.assignedToCardsCents),
            section: 'cards' as const,
            help: CARD_WORDS.freeWaitingHelp,
          },
        ]
      : []),
    {
      sign: '=',
      name: FREE_SUM_WORDS.result,
      value:
        figure.kind === 'over'
          ? `−${formatCents(figure.cents)}`
          : formatCents(balances.freeToSpendCents),
      isResult: true,
    },
  ];
  const openSection = (section: PlanSection) => {
    leaveViewForTab('plan', section);
  };
  const now = useNow(60_000);
  const startCreatedAt = useAppSelector((state) =>
    state.runway.moves
      .filter((move) => move.kind === 'start' && move.reversesMoveId === null)
      .reduce<number | null>(
        (first, move) =>
          first === null || move.createdAt < first ? move.createdAt : first,
        null,
      ),
  );
  const days = useAppSelector((state) => state.runway.days);
  const isStartOpen = canChangeStart({
    startDate,
    startCreatedAt,
    confirmedDays: days
      .filter((day) => day.status === 'confirmed')
      .map((day) => day.arrivedOn ?? day.expectedOn),
    now,
  });

  const getTitle = () => {
    if (isChecking) return CHECK_WORDS.title;
    if (isCheckingBalance) return BALANCE_CHECK_WORDS.title;
    return sheetKey === null ? HOME_WORDS.freeToSpend : 'Where things stand';
  };
  const getBack = () => {
    if (isChecking) return closeCheckAmount;
    if (isCheckingBalance) return closeCheckBalance;
    return sheetKey === null ? undefined : () => setSheetKey(null);
  };

  return (
    <Subview
      title={getTitle()}
      onClose={onClose}
      onBack={getBack()}
      headerAction={<ValuesEyeButton />}
    >
      {isChecking ? (
        <CheckAmountBody presetEnvelopeId={checkEnvelope} />
      ) : isCheckingBalance ? (
        <CheckBalanceBody />
      ) : sheetKey !== null ? (
        <StartingAmountsSheet
          key={sheetKey}
          isOpen
          isInline
          onClose={() => setSheetKey(null)}
        />
      ) : !isLedgerReady ? (
        <p className='text-muted-foreground text-sm'>Getting your plan.</p>
      ) : (
        <div className='space-y-4'>
          <div className='border-border bg-accent rounded-2xl border p-4'>
            <p className='text-muted-foreground text-sm font-medium'>
              {free.label}
            </p>
            <p className='text-4xl font-semibold tracking-tight tabular-nums'>
              <SensitiveValue>{free.value}</SensitiveValue>
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
            <div className='border-border bg-card divide-border divide-y rounded-2xl border text-sm'>
              {rows.map((row) => {
                const cells = [
                  <span
                    key='sign'
                    className='text-muted-foreground text-center'
                    aria-hidden='true'
                  >
                    {row.sign}
                  </span>,
                  <span
                    key='name'
                    className={join(
                      'min-w-0 text-left',
                      row.isResult && 'font-medium',
                    )}
                  >
                    {row.name}
                    {row.help && (
                      <span className='relative z-10 ml-1 inline-block align-middle'>
                        <HelpTip title={row.name}>{row.help}</HelpTip>
                      </span>
                    )}
                  </span>,
                  <span
                    key='value'
                    className={join(
                      'text-right whitespace-nowrap tabular-nums',
                      row.isResult ? 'text-base font-semibold' : 'font-medium',
                    )}
                  >
                    <SensitiveValue>{row.value}</SensitiveValue>
                  </span>,
                  <span key='chevron' className='flex justify-center'>
                    {row.section && (
                      <ChevronRight
                        className='text-muted-foreground h-4 w-4'
                        aria-hidden='true'
                      />
                    )}
                  </span>,
                ];
                const rowClass =
                  'grid min-h-12 grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-x-2 px-3 py-2';
                const { section } = row;
                return (
                  <div key={row.name}>
                    {section && row.help ? (
                      <div className={join(rowClass, 'relative')}>
                        {cells}
                        <Button
                          type='button'
                          variant='tertiary'
                          size='stripped'
                          className='absolute inset-0 size-full rounded-none'
                          aria-label={`${row.name}. See what makes it up`}
                          onClick={() => openSection(section)}
                        />
                      </div>
                    ) : section ? (
                      <Button
                        type='button'
                        variant='tertiary'
                        size='stripped'
                        className={join(
                          rowClass,
                          'text-foreground! grid! w-full text-left font-normal',
                        )}
                        aria-label={`${row.name}. See what makes it up`}
                        onClick={() => openSection(section)}
                      >
                        {cells}
                      </Button>
                    ) : (
                      <div className={rowClass}>{cells}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <ActionGroup isRoomy>
            {isStartOpen && (
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
            )}
            {level === 'track' && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Calculator />}
                label={CHECK_WORDS.open}
                subtitle={ENVELOPE_SPEND_WORDS.checkSub}
                onClick={() => openCheckAmount(null)}
              />
            )}
            {level === 'track' && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Landmark />}
                label={BALANCE_CHECK_WORDS.open}
                subtitle={BALANCE_CHECK_WORDS.openSub}
                onClick={openCheckBalance}
              />
            )}
          </ActionGroup>
          {!isStartOpen && (
            <p className='text-muted-foreground text-sm'>
              {FREE_SUM_WORDS.laterFix}
            </p>
          )}
        </div>
      )}
    </Subview>
  );
}

export default FreeToSpendScreen;
