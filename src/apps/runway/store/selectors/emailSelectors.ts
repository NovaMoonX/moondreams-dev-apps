import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  findEmailTwins,
  findPostedOnlySides,
  getEmailWaitDays,
  getSideKey,
  getTwinHeldIds,
  isWaitingEmail,
} from '@apps/runway/engine/emailTwins';
import { mergePurchases, toTwinnedEmailIds } from '@apps/runway/engine/figures';
import { makeIsLinkHistory } from '@apps/runway/engine/linkHistory';
import type { OpenPurchase } from '@apps/runway/types';
import { cleanBankName } from '@apps/runway/utils/accountText';

/** The window and Needs a home together, each purchase once. */
export const selectAllPurchases = createSelector(
  [
    (state: RootState) => state.runway.needsHome,
    (state: RootState) => state.runway.purchases,
  ],
  mergePurchases,
);

/** Each emailed purchase still waiting and the bank charge it clearly is, and those that could be more than one. */
export const selectEmailTwins = createSelector(
  [selectAllPurchases],
  findEmailTwins,
);

/** The bank charges a waiting emailed purchase is or may be, which a rule leaves alone. */
export const selectTwinHeldIds = createSelector(
  [selectEmailTwins],
  getTwinHeldIds,
);

/** The ids of emailed purchases whose bank charge is here, or could be one of several here: the charge counts, so Free to Spend and a card's balance leave them out rather than count one purchase twice. */
export const selectTwinnedEmailIds = createSelector(
  [selectEmailTwins],
  toTwinnedEmailIds,
);

/** The cards and accounts whose bank has sent posted charges (not a link's history) and never a pending one, so an emailed purchase on them waits for the charge to post. */
export const selectPostedOnlySides = createSelector(
  [
    selectAllPurchases,
    (state: RootState) => state.runway.links,
    (state: RootState) => state.runway.accounts,
    (state: RootState) => state.runway.cards,
  ],
  (purchases, links, accounts, cards): ReadonlySet<string> =>
    findPostedOnlySides(purchases, makeIsLinkHistory(links, accounts, cards)),
);

/** Each card's and account's bank as a person says it, by `getSideKey`; one with no name is left out. */
export const selectSideBankNames = createSelector(
  [
    (state: RootState) => state.runway.cards,
    (state: RootState) => state.runway.accounts,
  ],
  (cards, accounts): ReadonlyMap<string, string> =>
    new Map(
      [
        ...cards.map((card): [string, string] => [
          `card:${card.id}`,
          card.issuer,
        ]),
        ...accounts.map((account): [string, string] => [
          `account:${account.id}`,
          account.institution,
        ]),
      ].flatMap(([key, name]): [string, string][] =>
        name.trim() === '' ? [] : [[key, cleanBankName(name)]],
      ),
    ),
);

/** The bank an emailed purchase waits on, when its card or account is known, and whether that bank only sends a charge once it posts. */
export const getWaitingBank = (
  purchase: Pick<OpenPurchase, 'accountId' | 'paidByCardId'>,
  names: ReadonlyMap<string, string>,
  postedOnly: ReadonlySet<string>,
) => {
  const key = getSideKey(purchase);
  return {
    name: key === null ? null : (names.get(key) ?? null),
    isPostedOnly: key !== null && postedOnly.has(key),
  };
};

/** The ids of every emailed purchase still waiting for its bank. */
export const selectEmailWaitingIds = createSelector(
  [selectAllPurchases],
  (purchases): Set<string> =>
    new Set(purchases.filter(isWaitingEmail).map((purchase) => purchase.id)),
);

/** Whether an emailed purchase is still waiting, has no bank twin and is older than `getEmailWaitDays` says. */
export const isOverdueEmail = (
  purchase: OpenPurchase,
  twinned: ReadonlySet<string>,
  postedOnly: ReadonlySet<string>,
  today: number,
) =>
  isWaitingEmail(purchase) &&
  !twinned.has(purchase.id) &&
  purchase.date < today - getEmailWaitDays(purchase, postedOnly) * DAY_MS;

/** Emailed purchases still waiting, with no clear bank twin, dated more than their wait before today and already answered (one still in Needs a home is asked about there), oldest first: what Home asks about once. */
export const selectEmailOverdue = createSelector(
  [
    selectAllPurchases,
    selectTwinnedEmailIds,
    selectPostedOnlySides,
    () => todayAsUtcDate(),
  ],
  (purchases, twinned, postedOnly, today): OpenPurchase[] =>
    purchases
      .filter(
        (purchase) =>
          !purchase.needsHome &&
          isOverdueEmail(purchase, twinned, postedOnly, today),
      )
      .sort((a, b) => a.date - b.date || a.id.localeCompare(b.id)),
);

export const selectEmailIntake = (state: RootState) => state.runway.emailIntake;

export const selectIsEmailIntakeLoaded = (state: RootState) =>
  state.runway.isEmailIntakeLoaded;

export const selectIsEmailIntakeFailed = (state: RootState) =>
  state.runway.isEmailIntakeFailed;

export const selectEmailIntakeAttempt = (state: RootState) =>
  state.runway.emailIntakeAttempt;

/** Newest first. */
export const selectEmailEvents = (state: RootState) => state.runway.emailEvents;

export const selectIsEmailEventsLoaded = (state: RootState) =>
  state.runway.isEmailEventsLoaded;

/** The ids of every purchase the plan has open, for a link that must not point at one that is gone. */
export const selectPurchaseIds = createSelector(
  [selectAllPurchases],
  (purchases): ReadonlySet<string> =>
    new Set(purchases.map((purchase) => purchase.id)),
);

export const selectEmailFilters = (state: RootState) =>
  state.runway.emailFilters;
