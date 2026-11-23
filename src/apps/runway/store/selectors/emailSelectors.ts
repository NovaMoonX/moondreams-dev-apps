import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { EMAIL_WAIT_DAYS } from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import { findEmailTwins, isWaitingEmail } from '@apps/runway/engine/emailTwins';
import { cleanBankName } from '@apps/runway/utils/accountText';
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

/** The ids of emailed purchases whose bank charge is here, or could be one of several here: the charge counts, so Free to Spend and a card's balance leave them out rather than count one purchase twice. */
export const selectTwinnedEmailIds = createSelector(
  [selectEmailTwins],
  (twins): ReadonlySet<string> =>
    new Set([...twins.clear.keys(), ...twins.ambiguous]),
);

/** The ids of every emailed purchase still waiting for its bank. */
export const selectEmailWaitingIds = createSelector(
  [selectAllPurchases],
  (purchases): Set<string> =>
    new Set(purchases.filter(isWaitingEmail).map((purchase) => purchase.id)),
);

/** Whether an emailed purchase is still waiting, has no bank twin and is older than `EMAIL_WAIT_DAYS`. */
export const isOverdueEmail = (
  purchase: OpenPurchase,
  twinned: ReadonlySet<string>,
  today: number,
) =>
  isWaitingEmail(purchase) &&
  !twinned.has(purchase.id) &&
  purchase.date < today - EMAIL_WAIT_DAYS * DAY_MS;

/** Emailed purchases still waiting, with no clear bank twin, dated more than `EMAIL_WAIT_DAYS` before today, oldest first: what Home asks about once. */
export const selectEmailOverdue = createSelector(
  [selectAllPurchases, selectTwinnedEmailIds, () => todayAsUtcDate()],
  (purchases, twinned, today): OpenPurchase[] =>
    purchases
      .filter((purchase) => isOverdueEmail(purchase, twinned, today))
      .sort((a, b) => a.date - b.date || a.id.localeCompare(b.id)),
);

export const selectEmailIntake = (state: RootState) => state.runway.emailIntake;

export const selectEmailSetup = (state: RootState) => state.runway.emailSetup;

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

export interface KnownBank {
  name: string;
  logo: string | null;
}

/** The banks Runway already knows from the person's cards, accounts and links, each once by name, with its logo when a link gave one. */
export const selectKnownBanks = createSelector(
  [
    (state: RootState) => state.runway.cards,
    (state: RootState) => state.runway.accounts,
    (state: RootState) => state.runway.links,
  ],
  (cards, accounts, links): KnownBank[] => {
    const logoOf = (linkId: string | null) =>
      links.find((link) => link.id === linkId)?.institutionLogo ?? null;
    const found = [
      ...links.map((link) => ({
        name: link.institutionName,
        logo: link.institutionLogo,
      })),
      ...cards
        .filter((card) => card.archivedAt === null)
        .map((card) => ({ name: card.issuer, logo: logoOf(card.linkId) })),
      ...accounts
        .filter((account) => account.archivedAt === null)
        .map((account) => ({
          name: account.institution,
          logo: logoOf(account.linkId),
        })),
    ];
    const byName = found.reduce((map, bank) => {
      const name = cleanBankName(bank.name);
      const key = name.toLowerCase();
      if (!name) return map;
      const kept = map.get(key);
      if (kept === undefined || (kept.logo === null && bank.logo !== null)) {
        map.set(key, { name: kept?.name ?? name, logo: bank.logo });
      }
      return map;
    }, new Map<string, KnownBank>());
    return [...byName.values()];
  },
);
