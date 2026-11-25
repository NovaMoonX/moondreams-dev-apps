import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  findAutoChecks,
  getMatchedKeys,
  getPaymentKey,
  toAutoBills,
  type AutoCheck,
} from '@apps/runway/engine/autoPay';
import {
  getPaysItselfFromByBill,
  getSelfPayingBills,
} from '@apps/runway/engine/figures';
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
const selectPaysItselfFrom = createSelector(
  [selectVersions],
  getPaysItselfFromByBill,
);

/** The bills that pay themselves (from Track up), with what `isSelfPaying` reads. Takes today as its second argument, like the other bill selectors. */
export const selectSelfPayingBills = createSelector(
  [
    selectBills,
    selectLevel,
    selectMoves,
    selectPaysItselfFrom,
    selectStartDate,
  ],
  getSelfPayingBills,
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
  toAutoBills,
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
