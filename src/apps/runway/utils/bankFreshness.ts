import { formatTimeAgo } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { ACCOUNT_WORDS, FRESH_DOT_MS } from '@apps/runway/constants';
import { getPendingCents } from '@apps/runway/engine/accounts';
import type { OpenAccountBalance } from '@apps/runway/types';

const HOUR_MS = 3_600_000;

/** How long ago the bank updated a figure ("Updated 4 min ago", or "4 min ago" for a row) and whether it is new enough for the dot; null from a day on, where the date reads better. */
export function describeBankUpdated(
  asOf: number,
  now: number,
  isShort = false,
) {
  const elapsed = Math.max(0, now - asOf);
  if (elapsed >= 24 * HOUR_MS) return null;
  const ago = formatTimeAgo(asOf, now, !isShort);
  return {
    text: isShort ? ago : ACCOUNT_WORDS.updated(ago),
    isFresh: elapsed < FRESH_DOT_MS,
  };
}

/** "4 min ago · $150 pending" for a linked account's row, money written short: each part left out when it has nothing to say. */
export function describeBankFacts(
  bank: Pick<OpenAccountBalance, 'asOf' | 'cents' | 'availableCents'>,
  now: number,
) {
  const updated = describeBankUpdated(bank.asOf, now, true);
  const pendingCents = getPendingCents(bank) ?? 0;
  const parts = [
    updated?.text ?? null,
    pendingCents > 0
      ? ACCOUNT_WORDS.pendingAmount(formatCentsShort(pendingCents))
      : null,
  ].filter((part): part is string => part !== null);
  return { text: parts.join(' · '), isFresh: updated?.isFresh ?? false };
}
