import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { resolvePayFromAccountId } from '@apps/runway/engine/accounts';
import {
  getUndoneDueDays,
  isAutoBill,
  type AutoBill,
} from '@apps/runway/engine/autoPay';
import { startOfUtcDay } from '@apps/runway/engine/dates';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectBillPayments,
  selectBills,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly } from '@apps/runway/types';

const selectMoves = (state: RootState) => state.runway.moves;
const selectMatchKeys = (state: RootState) => state.runway.matchKeys;
const selectStartDate = (state: RootState) =>
  state.runway.plan?.startDate ?? null;

/** The bills that pay themselves (from Track up), each with the due days of its payments whose automatic mark was taken back. Takes today as its second argument, like the other bill selectors. */
export const selectSelfPayingBills = createSelector(
  [selectBills, selectLevel, selectMoves],
  (bills, level, moves): Record<string, { undoneDueOn: DateOnly[] }> => {
    const undone = getUndoneDueDays(moves);
    return Object.fromEntries(
      bills
        .filter(({ version }) => isAutoBill(version.payload, level))
        .map(({ item }) => [item.id, { undoneDueOn: undone[item.id] ?? [] }]),
    );
  },
);

/** The bills that pay themselves as the engine reads them. Takes today as its second argument. */
export const selectAutoBills = createSelector(
  [
    selectBills,
    selectBillPayments,
    selectLevel,
    selectMoves,
    selectAccounts,
    selectMatchKeys,
    selectStartDate,
    selectRecentFrom,
  ],
  (
    bills,
    payments,
    level,
    moves,
    accounts,
    matchKeys,
    startDate,
    recentFrom,
  ): AutoBill[] => {
    const undone = getUndoneDueDays(moves);
    return bills
      .filter(({ version }) => isAutoBill(version.payload, level))
      .map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        since: Math.max(
          startOfUtcDay(item.createdAt),
          startDate ?? 0,
          recentFrom ?? 0,
        ),
        cardId: version.payload.paidByCardId ?? null,
        accountId: resolvePayFromAccountId(version.payload.accountId, accounts),
        merchantKeys: matchKeys[item.id] ?? [],
        payments: (payments[item.id] ?? []).map((payment) => ({
          dueOn: payment.dueOn,
          lowCents: payment.ranged
            ? payment.ranged.range.lowCents
            : payment.totalCents,
          highCents: payment.ranged
            ? payment.ranged.range.highCents
            : payment.totalCents,
          paid: payment.paid,
        })),
        undoneDueOn: undone[item.id] ?? [],
      }));
  },
);

const NO_NAMES: string[] = [];

/** The merchant names a bill has learned; none while it has learned none. */
export const selectLearnedNames = (state: RootState, billId: string) =>
  state.runway.matchKeys[billId] ?? NO_NAMES;
