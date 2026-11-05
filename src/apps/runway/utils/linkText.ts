import { formatDateOrdinal } from '@/utils/formatUtils';
import { LINK_WORDS } from '@apps/runway/constants';
import type { OpenLink } from '@apps/runway/types';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "2 minutes ago", "yesterday"; "just now" inside the first minute. */
export function formatUpdatedAgo(at: number, now: number) {
  const elapsed = Math.max(0, now - at);
  const unit = UNITS.find(([, size]) => elapsed >= size);
  if (!unit) return 'just now';
  return formatter.format(-Math.floor(elapsed / unit[1]), unit[0]);
}

/** "Started Nov 5th · 2 accounts": one line under a Finish linking row (a newer sign-in at the bank replaces it). */
export function describeUnfinishedLink(link: OpenLink) {
  return LINK_WORDS.unfinishedStarted(
    formatDateOrdinal(link.createdAt),
    link.providerAccounts.length,
  );
}

/** A link no account of the bank has been bound to or left out of yet. */
export const isUnfinishedLink = (link: OpenLink) =>
  link.providerAccounts.every(
    (entry) =>
      entry.accountId === null && entry.cardId === null && !entry.isSkipped,
  );
