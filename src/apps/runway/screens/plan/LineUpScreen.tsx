import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import MoneyInput from '@/components/MoneyInput';
import ModalFooterActions from '@/components/ModalFooterActions';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import { TRACKING_WORDS } from '@apps/runway/constants';
import type { FreeToSpendFigure } from '@apps/runway/engine/balances';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import { getEarliestTrackingStart } from '@apps/runway/engine/level';
import { collectStarted } from '@apps/runway/engine/progress';
import { AmountList } from '@apps/runway/forms/StartingAmountsSheet';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import type { StartHoldingInput } from '@apps/runway/store/actions/moveActions';
import { moveToTrack } from '@apps/runway/store/actions/planActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';

interface LineUpScreenProps {
  onClose: () => void;
}

const toText = (cents: number | undefined) =>
  cents === undefined ? '' : (cents / 100).toFixed(2);

/** Where is your money now? The day tracking starts and what the money on hand, each envelope, goal and bill holds that day, lined up so what is assigned never quietly passes what is held. */
function LineUpScreen({ onClose }: LineUpScreenProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate(useNow(60_000));
  const plan = useAppSelector((state) => state.runway.plan);
  const balances = useAppSelector(selectBalances);
  const moves = useAppSelector((state) => state.runway.moves);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const earliest = getEarliestTrackingStart(plan?.trackingPeriods ?? []);

  const [date, setDate] = useState(toDateInputValue(today));
  const [money, setMoney] = useState(
    balances.hasMoney ? toText(balances.moneyOnHandCents) : '',
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(balances.assignedByItem).map(([id, cents]) => [
        id,
        toText(cents),
      ]),
    ),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDate = fromDateInputValue(date) ?? null;
  const started = collectStarted(moves, startDate);
  const rows = [
    ...envelopes.map(({ item, version }) => ({
      holding: 'envelope' as const,
      id: item.id,
      name: version.payload.name,
    })),
    ...goals.map(({ item, version }) => ({
      holding: 'goal' as const,
      id: item.id,
      name: version.payload.name,
    })),
    ...bills.map(({ item, version }) => ({
      holding: 'bill' as const,
      id: item.id,
      name: version.payload.name,
    })),
  ];
  const moneyCents = parseMoneyToCents(money);
  const typed = rows.map((row) => ({
    ...row,
    cents: parseMoneyToCents(amounts[row.id] ?? ''),
  }));
  const assignedCents = typed.reduce((sum, row) => sum + (row.cents ?? 0), 0);
  const getFigure = (): FreeToSpendFigure => {
    if (moneyCents === null) return { kind: 'unknown' };
    if (moneyCents < assignedCents) {
      return { kind: 'over', cents: assignedCents - moneyCents };
    }
    return { kind: 'amount', cents: moneyCents - assignedCents };
  };
  const free = describeFreeToSpend(getFigure());

  const holdings: StartHoldingInput[] = [
    ...(moneyCents === null
      ? []
      : [{ holding: 'money' as const, refId: null, amountCents: moneyCents }]),
    ...typed.flatMap((row): StartHoldingInput[] => {
      if (row.cents !== null) {
        return [
          { holding: row.holding, refId: row.id, amountCents: row.cents },
        ];
      }
      return started.byItem[row.id] === undefined
        ? []
        : [{ holding: row.holding, refId: row.id, amountCents: 0 }];
    }),
  ];
  const note =
    startDate === null || startDate > today
      ? 'Pick today or an earlier day.'
      : earliest !== null && startDate < earliest
        ? `Tracking stopped on ${formatDateUTC(earliest - DAY_MS)}. You can start again from ${formatDateUTC(earliest)}.`
        : moneyCents === null
          ? 'Say how much money you have on hand.'
          : null;

  const save = async () => {
    if (!user || startDate === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await moveToTrack(user.uid, encryption, startDate, holdings);
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(saveError, 'That did not save. Nothing was changed.'),
      );
      setIsSaving(false);
    }
  };

  const setAmount = (id: string, value: string) =>
    setAmounts((current) => ({ ...current, [id]: value }));
  const pick = (holding: string) =>
    rows
      .filter((row) => row.holding === holding)
      .map(({ id, name }) => ({ id, name }));

  return (
    <Subview
      overlay
      isTitleWrapped
      title={TRACKING_WORDS.lineUpTitle}
      onClose={onClose}
    >
      <div className='flex flex-1 flex-col gap-4'>
        <p className='text-muted-foreground text-sm text-pretty'>
          {TRACKING_WORDS.lineUpHelp}
        </p>
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>
            {TRACKING_WORDS.startsOn}
          </p>
          <Input
            type='date'
            variant='outline'
            aria-label={TRACKING_WORDS.startsOn}
            min={earliest === null ? undefined : toDateInputValue(earliest)}
            max={toDateInputValue(today)}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {earliest !== null && (
            <p className='text-muted-foreground text-xs'>
              {TRACKING_WORDS.freshStart}
            </p>
          )}
        </div>
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>
            {TRACKING_WORDS.moneyOnHand}
          </p>
          <MoneyInput
            variant='outline'
            ariaLabel={TRACKING_WORDS.moneyOnHand}
            value={money}
            onChange={setMoney}
            placeholder='What you have right now'
          />
          <p className='text-muted-foreground text-xs'>
            {TRACKING_WORDS.moneyHint}
          </p>
        </div>
        <dl className='border-border bg-accent rounded-2xl border p-4'>
          <div className='flex items-start justify-between gap-3 text-sm'>
            <dt className='text-muted-foreground'>
              {TRACKING_WORDS.lineUpTotal}
            </dt>
            <dd className='font-medium whitespace-nowrap tabular-nums'>
              {formatCents(assignedCents)}
            </dd>
          </div>
          <div className='flex items-start justify-between gap-3'>
            <dt className='text-muted-foreground text-sm'>{free.label}</dt>
            <dd className='text-lg font-semibold whitespace-nowrap tabular-nums'>
              {free.value}
            </dd>
          </div>
        </dl>
        <AmountList
          label={TRACKING_WORDS.envelopes}
          rows={pick('envelope')}
          values={amounts}
          onChange={setAmount}
        />
        <AmountList
          label={TRACKING_WORDS.goals}
          rows={pick('goal')}
          values={amounts}
          onChange={setAmount}
        />
        <AmountList
          label={TRACKING_WORDS.bills}
          rows={pick('bill')}
          values={amounts}
          onChange={setAmount}
        />
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <ModalFooterActions
          note={note}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSaving}
              disabled={isSaving || note !== null}
              onClick={() => void save()}
            >
              {TRACKING_WORDS.start}
            </Button>
          }
        />
      </div>
    </Subview>
  );
}

export default LineUpScreen;
