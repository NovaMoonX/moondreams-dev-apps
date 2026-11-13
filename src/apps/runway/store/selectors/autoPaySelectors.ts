import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { resolvePayFromAccountId } from '@apps/runway/engine/accounts';
import {
  findAutoChecks,
  getMatchedKeys,
  getPaymentKey,
  getPaysItselfFrom,
  getUndoneDueDays,
  isAutoBill,
  type AutoBill,
  type AutoCheck,
  type SelfPayingFacts,
} from '@apps/runway/engine/autoPay';
import { startOfUtcDay } from '@apps/runway/engine/dates';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectBillPayments,
  selectBills,
  selectIsAccountsLoaded,
  selectIsMovesLoaded,
  selectIsNeedsHomeLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isChargeSnoozed } from '@apps/runway/utils/chargeSnooze';

const selectMoves = (state: RootState) => state.runway.moves;
const selectVersions = (state: RootState) => state.runway.versions;
const selectMatchKeys = (state: RootState) => state.runway.matchKeys;
const selectStartDate = (state: RootState) =>
  state.runway.plan?.startDate ?? null;

/** The day each bill's "pays itself" setting was turned on, by bill id. */
const selectPaysItselfFrom = createSelector([selectVersions], (versions) => {
  const billVersions = versions.flatMap((version) =>
    version.kind === 'bill' ? [version] : [],
  );
  const ids = [...new Set(billVersions.map((version) => version.itemId))];
  return Object.fromEntries(
    ids.map((id) => [
      id,
      getPaysItselfFrom(
        billVersions.filter((version) => version.itemId === id),
      ),
    ]),
  );
});

/** The bills that pay themselves (from Track up), with what `isSelfPaying` reads. Takes today as its second argument, like the other bill selectors. */
export const selectSelfPayingBills = createSelector(
  [
    selectBills,
    selectLevel,
    selectMoves,
    selectPaysItselfFrom,
    selectStartDate,
  ],
  (
    bills,
    level,
    moves,
    paysItselfFrom,
    startDate,
  ): Record<string, SelfPayingFacts & { paysItself: true }> => {
    const undone = getUndoneDueDays(moves);
    return Object.fromEntries(
      bills
        .filter(({ version }) => isAutoBill(version.payload, level))
        .map(({ item }) => [
          item.id,
          {
            paysItself: true as const,
            undoneDueOn: undone[item.id] ?? [],
            paysItselfFrom: Math.max(
              paysItselfFrom[item.id] ?? 0,
              startDate ?? 0,
            ),
            isAtLink: level === 'link',
          },
        ]),
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
    selectPaysItselfFrom,
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
    paysItselfFrom,
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
          paysItselfFrom[item.id] ?? 0,
        ),
        cardId: version.payload.paidByCardId ?? null,
        accountId: resolvePayFromAccountId(version.payload.accountId, accounts),
        merchantKeys: matchKeys[item.id] ?? [],
        payments: (payments[item.id] ?? []).map((payment) => ({
          dueOn: payment.dueOn,
          payOn: payment.payOn,
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

/** The ledger, plan and bank charges an automatic mark or match reads are all loaded. */
export const selectIsAutoPayReady = (state: RootState) =>
  selectIsMovesLoaded(state) &&
  selectIsRecordsReady(state) &&
  selectIsPlanItemsLoaded(state) &&
  state.runway.isMatchKeysLoaded &&
  state.runway.purchasesFrom !== null &&
  selectIsAccountsLoaded(state) &&
  selectIsNeedsHomeLoaded(state);

const NO_CHECKS: AutoCheck[] = [];

/** The questions bills that pay themselves leave. Takes today and the snooze version (put-off questions live on the device) as its arguments. */
export const selectAutoChecks = createSelector(
  [
    selectIsAutoPayReady,
    selectLevel,
    (state: RootState, today: number) => selectAutoBills(state, today),
    (state: RootState) => state.runway.purchases,
    (_state: RootState, today: number) => today,
    (_state: RootState, _today: number, snoozes: number) => snoozes,
  ],
  (isReady, level, bills, purchases, today): AutoCheck[] =>
    isReady
      ? findAutoChecks({
          level,
          today,
          bills,
          matched: getMatchedKeys(purchases),
          snoozed: new Set(
            bills
              .flatMap((bill) =>
                bill.payments.map((payment) =>
                  getPaymentKey(bill.id, payment.dueOn),
                ),
              )
              .filter((key) => isChargeSnoozed(key)),
          ),
        })
      : NO_CHECKS,
);

const NO_NAMES: string[] = [];

/** The merchant names a bill has learned; none while it has learned none. */
export const selectLearnedNames = (state: RootState, billId: string) =>
  state.runway.matchKeys[billId] ?? NO_NAMES;
