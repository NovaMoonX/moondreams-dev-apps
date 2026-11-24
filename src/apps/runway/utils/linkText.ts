import { formatDateOrdinal } from '@/utils/formatUtils';
import { LINK_WORDS } from '@apps/runway/constants';
import type { OpenLink } from '@apps/runway/types';

/** "Started Nov 5th · 2 accounts": one line under a Finish linking row (a newer sign-in at the bank replaces it). */
export function describeUnfinishedLink(link: OpenLink) {
  return LINK_WORDS.unfinishedStarted(
    formatDateOrdinal(link.createdAt),
    link.providerAccounts.length,
  );
}

/** A link still open whose accounts of the bank have none bound or left out yet; an unlinked one is never unfinished. */
export const isUnfinishedLink = (link: OpenLink) =>
  link.status !== 'revoked' &&
  link.providerAccounts.every(
    (entry) =>
      entry.accountId === null && entry.cardId === null && !entry.isSkipped,
  );

/** A finished link still bringing purchases in: not revoked, and at least one account bound or left out. */
export const isLiveLink = (link: OpenLink) =>
  link.status !== 'revoked' && !isUnfinishedLink(link);

/** A finished link the person unlinked. */
export const isUnlinkedLink = (link: OpenLink) => link.status === 'revoked';

/** How many of the bank's accounts were brought in (bound to one of the person's). */
export const countBroughtIn = (link: OpenLink) =>
  link.providerAccounts.filter(
    (entry) => entry.accountId !== null || entry.cardId !== null,
  ).length;
