import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { EMAIL_WAIT_DAYS } from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import { findEmailTwins, isWaitingEmail } from '@apps/runway/engine/emailTwins';
import type { OpenPurchase } from '@apps/runway/types';

/** The window and Needs a home together, each purchase once. */
const selectAllPurchases = createSelector(
  [
    (state: RootState) => state.runway.needsHome,
    (state: RootState) => state.runway.purchases,
  ],
  (needsHome, purchases): OpenPurchase[] => [
    ...new Map(
      [...needsHome, ...purchases].map((purchase) => [purchase.id, purchase]),
    ).values(),
  ],
);

/** Each emailed purchase still waiting and the bank charge it clearly is, and those that could be more than one. */
export const selectEmailTwins = createSelector(
  [selectAllPurchases],
  findEmailTwins,
);

/** The ids of emailed purchases whose bank charge is here: the charge counts, so Free to Spend and a card's balance leave them out. */
export const selectTwinnedEmailIds = createSelector(
  [selectEmailTwins],
  (twins): ReadonlySet<string> => new Set(twins.clear.keys()),
);

/** The ids of every emailed purchase still waiting for its bank. */
export const selectEmailWaitingIds = createSelector(
  [selectAllPurchases],
  (purchases): Set<string> =>
    new Set(purchases.filter(isWaitingEmail).map((purchase) => purchase.id)),
);

/** Emailed purchases still waiting, with no clear bank twin, dated more than `EMAIL_WAIT_DAYS` before today, oldest first: what Home asks about once. */
export const selectEmailOverdue = createSelector(
  [selectAllPurchases, selectTwinnedEmailIds, () => todayAsUtcDate()],
  (purchases, twinned, today): OpenPurchase[] =>
    purchases
      .filter(
        (purchase) =>
          isWaitingEmail(purchase) &&
          !twinned.has(purchase.id) &&
          purchase.date < today - EMAIL_WAIT_DAYS * DAY_MS,
      )
      .sort((a, b) => a.date - b.date || a.id.localeCompare(b.id)),
);

export const selectEmailIntake = (state: RootState) => state.runway.emailIntake;

/** Newest first. */
export const selectEmailEvents = (state: RootState) => state.runway.emailEvents;

export const selectEmailFilters = (state: RootState) =>
  state.runway.emailFilters;
