import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { DAY_MS } from '@apps/runway/engine/dates';
import { getDueCards } from '@apps/runway/engine/cards';
import {
  getAccountMoves,
  getMoveWindow,
  type AccountMove,
  type MoveBillInput,
  type MoveCardInput,
} from '@apps/runway/engine/moves';
import {
  resolveCurrentOrNext,
  resolveVersion,
} from '@apps/runway/engine/resolve';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectAllCards,
  selectBillPayments,
  selectListedDays,
  type ListedDay,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardName, getListedCards } from '@apps/runway/utils/cardText';
import type { BillVersion, PayLineVersion } from '@apps/runway/types';
import { isTrackingLevel } from '@apps/runway/engine/level';

const selectVersions = (state: RootState) => state.runway.versions;
const selectMoves = (state: RootState) => state.runway.moves;
const selectStartDate = (state: RootState) => state.runway.plan?.startDate ?? 0;
const selectDayKey = (_state: RootState, _today: number, dayKey: string) =>
  dayKey;

const NO_MOVES: AccountMove[] = [];
const NO_DONE: string[] = [];

/** The id a move is ticked by in its day's `doneLineIds`; the account's id, never an amount or a name. */
export const getMoveLineId = (accountId: string) => `move:${accountId}`;

const getNextIncomeOn = (
  listed: ReturnType<typeof selectListedDays>,
  day: ListedDay,
) =>
  [...listed.open, ...listed.confirmed]
    .map((entry) => entry.on)
    .filter((on) => on > day.on)
    .sort((a, b) => a - b)[0] ?? null;

/** The money to move into each pull account after one confirmed income day, soonest needed first; empty when the day is not confirmed. */
export const selectAccountMoves = createSelector(
  [
    selectListedDays,
    selectBillPayments,
    selectAccounts,
    selectAllCards,
    selectBalances,
    selectLevel,
    selectVersions,
    selectMoves,
    selectStartDate,
    selectDayKey,
    (_state: RootState, today: number) => today,
  ],
  (
    listed,
    billPayments,
    accounts,
    allCards,
    balances,
    level,
    versions,
    moves,
    startDate,
    dayKey,
    today,
  ): AccountMove[] => {
    const day = listed.confirmed.find((entry) => entry.dayKey === dayKey);
    if (!day || accounts.length === 0) return NO_MOVES;
    const isTrack = isTrackingLevel(level);
    const dayOn = day.arrivedOn ?? day.on;
    const nextIncomeOn = getNextIncomeOn(listed, day);
    const { start, end } = getMoveWindow(dayOn, nextIncomeOn);
    const billVersions = versions.filter(
      (version): version is BillVersion => version.kind === 'bill',
    );
    const payLineVersions = versions.filter(
      (version): version is PayLineVersion => version.kind === 'payLine',
    );
    const bills = Object.entries(billPayments).flatMap(
      ([billId, payments]): MoveBillInput[] =>
        payments.flatMap((payment) => {
          const version = resolveVersion(billVersions, billId, payment.dueOn);
          return payment.paid === null && version
            ? [
                {
                  id: billId,
                  name: version.payload.name,
                  dueOn: payment.dueOn,
                  cents: payment.totalCents,
                  paidByCardId: isTrack
                    ? (version.payload.paidByCardId ?? null)
                    : null,
                  accountId: version.payload.accountId ?? null,
                },
              ]
            : [];
        }),
    );
    const cards: MoveCardInput[] = isTrack
      ? getDueCards(
          getListedCards(allCards, balances.reserveByCard),
          balances.reserveByCard,
          moves,
          start,
          Math.ceil((end - start) / DAY_MS),
          startDate,
        ).map((due) => ({
          id: due.card.id,
          name: getCardName(due.card, allCards),
          dueOn: due.dueOn,
          cents: due.waitingCents,
          payFromAccountId: due.card.payFromAccountId ?? null,
        }))
      : [];
    return getAccountMoves({
      accounts,
      dayOn,
      nextIncomeOn,
      payAccountId:
        resolveCurrentOrNext(
          payLineVersions,
          day.payLineId,
          Math.max(day.on, today),
        )?.payload.accountId ?? null,
      today,
      bills,
      cards,
    });
  },
);

export interface HomeMoves {
  dayKey: string;
  moves: AccountMove[];
}

const selectLatestConfirmed = (state: RootState, today: number) =>
  selectListedDays(state, today).confirmed[0] ?? null;

const selectLatestMoves = (state: RootState, today: number) => {
  const latest = selectLatestConfirmed(state, today);
  return latest ? selectAccountMoves(state, today, latest.dayKey) : NO_MOVES;
};

const selectLatestEnd = (state: RootState, today: number) => {
  const listed = selectListedDays(state, today);
  const latest = listed.confirmed[0];
  return latest
    ? getMoveWindow(
        latest.arrivedOn ?? latest.on,
        getNextIncomeOn(listed, latest),
      ).end
    : null;
};

const selectLatestDone = (state: RootState, today: number) => {
  const latest = selectLatestConfirmed(state, today);
  return (
    state.runway.days.find((day) => day.id === latest?.dayKey)?.doneLineIds ??
    NO_DONE
  );
};

/** The latest confirmed day's moves still to do: unticked, and only while the window to the next income day is open. */
export const selectHomeMoves = createSelector(
  [
    selectLatestConfirmed,
    selectLatestMoves,
    selectLatestEnd,
    selectLatestDone,
    (_state: RootState, today: number) => today,
  ],
  (latest, moves, end, done, today): HomeMoves | null => {
    if (!latest || end === null || end <= today) return null;
    const open = moves.filter(
      (move) => !done.includes(getMoveLineId(move.accountId)),
    );
    return open.length === 0 ? null : { dayKey: latest.dayKey, moves: open };
  },
);
