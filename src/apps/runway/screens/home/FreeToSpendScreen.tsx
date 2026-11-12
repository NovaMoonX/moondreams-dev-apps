import { useState } from 'react';

import {
  ArrowDownLeft,
  Calculator,
  ChevronRight,
  Clock,
  Landmark,
  Wallet,
  WalletCards,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';

import HelpTip from '@/components/HelpTip';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { useAppSelector } from '@/store';
import {
  BALANCE_CHECK_WORDS,
  BANK_BACKED_WORDS,
  CARD_WORDS,
  CASH_POSITION_WORDS,
  CHECK_WORDS,
  ENVELOPE_SPEND_WORDS,
  FREE_SUM_WORDS,
  HOME_WORDS,
} from '@apps/runway/constants';
import { CheckAmountBody } from '@apps/runway/screens/home/CheckAmountScreen';
import { CheckBalanceBody } from '@apps/runway/screens/home/CheckBalanceScreen';
import { WhereYourCashIsBody } from '@apps/runway/screens/home/WhereYourCashIsScreen';
import LevelGate from '@apps/runway/components/LevelGate';
import { DEFAULT_SPEND_PERIOD } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import {
  selectMoneyIn,
  selectOnItsWay,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getSpendRange } from '@apps/runway/utils/spendPeriod';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import StartingAmountsSheet from '@apps/runway/forms/StartingAmountsSheet';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { canChangeStart } from '@apps/runway/utils/startingCorrection';
import HeldBreakdownView from '@apps/runway/screens/home/HeldBreakdownView';
import { selectBankBacking } from '@apps/runway/store/selectors/balanceSelectors';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';
import { isTrackingLevel } from '@apps/runway/engine/level';

interface FreeToSpendScreenProps {
  onClose: () => void;
}

type HeldViewName =
  'heldBills' | 'heldGoals' | 'heldEnvelopes' | 'heldHorizon' | 'heldCards';

interface SumRow {
  sign: string;
  name: string;
  value: string;
  view?: HeldViewName;
  /** What the row counts, behind an info icon beside its name. */
  help?: string;
  isEmphasised?: boolean;
}

/** Free to Spend in detail: the money on hand and what has a job, so the figure can be followed to its parts. */
function FreeToSpendScreen({ onClose }: FreeToSpendScreenProps) {
  const balances = useAppSelector(selectBalances);
  const level = useAppSelector(selectLevel);
  const isBankBacked = useAppSelector(selectBankBacking).isBacked;
  const {
    view,
    checkEnvelope,
    openCheckAmount,
    closeCheckAmount,
    openCheckBalance,
    closeCheckBalance,
    openCashPosition,
    closeCashPosition,
    openHeldView,
    closeHeldView,
    leaveViewForTab,
    showSpendKind,
    showSpendPeriod,
  } = useRunwayUrlState();
  const mask = useMaskedText();
  const { isHidden, toggle: toggleHidden } = useValuesHidden();
  const now = useNow(60_000);
  const monthRange = getSpendRange(DEFAULT_SPEND_PERIOD, todayAsUtcDate(now));
  const monthMoneyIn = useAppSelector(selectMoneyIn).filter(
    (purchase) =>
      purchase.date >= monthRange.from && purchase.date < monthRange.to,
  );
  const onItsWayCents = useAppSelector(selectOnItsWay)
    .filter(
      ({ purchase, heldBy }) =>
        heldBy === null &&
        purchase.date >= monthRange.from &&
        purchase.date < monthRange.to,
    )
    .reduce((sum, { purchase }) => sum - purchase.amountCents, 0);
  // Money with no envelopes and no pay raised Free to Spend itself; a pay or a refund to envelopes went to the plan.
  const sumIn = (straight: boolean) => {
    const cents = monthMoneyIn
      .filter(
        (purchase) =>
          (purchase.lines.length === 0 && purchase.incomeDayId === null) ===
          straight,
      )
      .reduce((sum, purchase) => sum - purchase.amountCents, 0);
    return cents === 0 ? null : formatCents(cents);
  };
  // The tab's own history entry is written first, so the filter lands on it rather than on Home's; a hidden total opens to a list it can be checked against, so amounts show first.
  const openMoneyIn = async () => {
    if (isHidden) toggleHidden();
    await leaveViewForTab('spend');
    showSpendKind('moneyIn');
    showSpendPeriod(DEFAULT_SPEND_PERIOD);
  };
  const isChecking = view === 'checkAmount';
  const isCheckingBalance = view === 'checkBalance';
  const isViewingCash = view === 'cashPosition';
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [sheetKey, setSheetKey] = useState<number | null>(null);
  const hasCards = useAppSelector(
    (state) =>
      state.runway.cards.length > 0 && isTrackingLevel(selectLevel(state)),
  );
  const figure = getFreeToSpendFigure(balances);
  const free = describeFreeToSpend(figure);
  const envelopesName =
    level === 'link'
      ? FREE_SUM_WORDS.envelopesLink
      : isTrackingLevel(level)
        ? FREE_SUM_WORDS.envelopesTrack
        : FREE_SUM_WORDS.envelopesPlan;
  const heldViews = {
    heldBills: {
      kind: 'bills',
      name: FREE_SUM_WORDS.bills,
      totalCents: balances.assignedToBillsCents,
    },
    heldGoals: {
      kind: 'goals',
      name: FREE_SUM_WORDS.goals,
      totalCents: balances.assignedToGoalsCents,
    },
    heldEnvelopes: {
      kind: 'envelopes',
      name: envelopesName,
      totalCents: balances.assignedToEnvelopesCents,
    },
    heldHorizon: {
      kind: 'horizon',
      name: FREE_SUM_WORDS.horizon,
      totalCents: balances.assignedToHorizonCents,
    },
    heldCards: {
      kind: 'cards',
      name: FREE_SUM_WORDS.cards,
      totalCents: balances.assignedToCardsCents,
    },
  } as const;
  const heldView = view !== null && view in heldViews ? view : null;
  const held =
    heldView === null ? null : heldViews[heldView as keyof typeof heldViews];
  const rows: SumRow[] = [
    {
      sign: '',
      name: FREE_SUM_WORDS.result,
      value:
        figure.kind === 'over'
          ? `−${formatCents(figure.cents)}`
          : formatCents(balances.freeToSpendCents),
      isEmphasised: true,
    },
    {
      sign: '+',
      name: envelopesName,
      value: formatCents(balances.assignedToEnvelopesCents),
      view: 'heldEnvelopes',
    },
    {
      sign: '+',
      name: FREE_SUM_WORDS.goals,
      value: formatCents(balances.assignedToGoalsCents),
      view: 'heldGoals',
    },
    ...(balances.assignedToHorizonCents !== 0
      ? [
          {
            sign: '+',
            name: FREE_SUM_WORDS.horizon,
            value: formatCents(balances.assignedToHorizonCents),
            view: 'heldHorizon' as const,
          },
        ]
      : []),
    {
      sign: '+',
      name: FREE_SUM_WORDS.bills,
      value: formatCents(balances.assignedToBillsCents),
      view: 'heldBills',
    },
    ...(balances.assignedToCardsCents !== 0
      ? [
          {
            sign: '+',
            name: FREE_SUM_WORDS.cards,
            value: formatCents(balances.assignedToCardsCents),
            view: 'heldCards' as const,
            help: CARD_WORDS.freeWaitingHelp,
          },
        ]
      : []),
    {
      sign: '=',
      name: FREE_SUM_WORDS.total,
      value: formatCents(balances.moneyOnHandCents),
      help:
        balances.bankAdjustCents !== 0
          ? BANK_BACKED_WORDS.sumHelp
          : hasCards
            ? CARD_WORDS.freeOnHandHelp
            : undefined,
    },
  ];
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
    if (isViewingCash) return CASH_POSITION_WORDS.title;
    if (held) return held.name;
    return sheetKey === null ? HOME_WORDS.freeToSpend : 'Where things stand';
  };
  const getBack = () => {
    if (isChecking) return closeCheckAmount;
    if (isCheckingBalance) return closeCheckBalance;
    if (isViewingCash) return closeCashPosition;
    if (held) return closeHeldView;
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
        <CheckBalanceBody onOpenDays={() => leaveViewForTab('days')} />
      ) : isViewingCash ? (
        <WhereYourCashIsBody />
      ) : held ? (
        <HeldBreakdownView
          kind={held.kind}
          name={held.name}
          totalCents={held.totalCents}
        />
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
                Counted from {formatDateOrdinalUTC(startDate)}
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
                      row.isEmphasised && 'font-medium',
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
                      row.isEmphasised
                        ? 'text-base font-semibold'
                        : 'font-medium',
                    )}
                  >
                    <SensitiveValue>{row.value}</SensitiveValue>
                  </span>,
                  <span key='chevron' className='flex justify-center'>
                    {row.view && (
                      <ChevronRight
                        className='text-muted-foreground h-4 w-4'
                        aria-hidden='true'
                      />
                    )}
                  </span>,
                ];
                const rowClass =
                  'grid min-h-12 grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-x-2 px-3 py-2';
                const { view: rowView } = row;
                return (
                  <div key={row.name}>
                    {rowView && row.help ? (
                      <div className={join(rowClass, 'relative')}>
                        {cells}
                        <Button
                          type='button'
                          variant='tertiary'
                          size='stripped'
                          className='absolute inset-0 size-full rounded-none'
                          aria-label={`${row.name}. See what makes it up`}
                          onClick={() => openHeldView(rowView)}
                        />
                      </div>
                    ) : rowView ? (
                      <Button
                        type='button'
                        variant='tertiary'
                        size='stripped'
                        className={join(
                          rowClass,
                          'text-foreground! grid! w-full text-left font-normal',
                        )}
                        aria-label={`${row.name}. See what makes it up`}
                        onClick={() => openHeldView(rowView)}
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
            {isStartOpen && !isBankBacked && (
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
            {isTrackingLevel(level) && (
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
            {isTrackingLevel(level) && !isBankBacked && (
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
            <LevelGate level='link'>
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<WalletCards />}
                label={CASH_POSITION_WORDS.open}
                subtitle={CASH_POSITION_WORDS.openSub}
                onClick={openCashPosition}
              />
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<ArrowDownLeft />}
                label={FREE_SUM_WORDS.moneyIn}
                subtitle={
                  monthMoneyIn.length === 0
                    ? FREE_SUM_WORDS.moneyInNone
                    : mask(FREE_SUM_WORDS.moneyInSub(sumIn(true), sumIn(false)))
                }
                onClick={() => void openMoneyIn()}
              />
              {onItsWayCents > 0 && (
                <ActionRow
                  isGrouped
                  isRoomy
                  hasChevron
                  icon={<Clock />}
                  label={FREE_SUM_WORDS.onItsWay}
                  subtitle={mask(
                    FREE_SUM_WORDS.onItsWaySub(formatCents(onItsWayCents)),
                  )}
                  onClick={() => void openMoneyIn()}
                />
              )}
            </LevelGate>
          </ActionGroup>
          {!isStartOpen && !isBankBacked && (
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
