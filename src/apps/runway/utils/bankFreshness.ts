import { formatCents } from '@/utils/moneyUtils';
import { ACCOUNT_WORDS, FRESH_DOT_MS } from '@apps/runway/constants';
import { getPendingCents } from '@apps/runway/engine/accounts';
import type { OpenAccountBalance } from '@apps/runway/types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** How long ago the bank updated a figure ("Updated 4 min ago") and whether it is new enough for the dot; null from a day on, where the date reads better. */
export function describeBankUpdated(asOf: number, now: number) {
  const elapsed = Math.max(0, now - asOf);
  const isFresh = elapsed < FRESH_DOT_MS;
  if (elapsed < MINUTE_MS) {
    return { text: ACCOUNT_WORDS.updatedJustNow, isFresh };
  }
  if (elapsed < HOUR_MS) {
    return {
      text: ACCOUNT_WORDS.updatedMinutes(Math.floor(elapsed / MINUTE_MS)),
      isFresh,
    };
  }
  if (elapsed < 24 * HOUR_MS) {
    return {
      text: ACCOUNT_WORDS.updatedHours(Math.floor(elapsed / HOUR_MS)),
      isFresh,
    };
  }
  return null;
}

/** "Updated 4 min ago · $150 pending" for a linked account with a bank figure: each part left out when it has nothing to say. */
export function describeBankFacts(
  bank: Pick<OpenAccountBalance, 'asOf' | 'cents' | 'availableCents'>,
  now: number,
) {
  const updated = describeBankUpdated(bank.asOf, now);
  const pendingCents = getPendingCents(bank) ?? 0;
  const parts = [
    updated?.text ?? null,
    pendingCents > 0
      ? ACCOUNT_WORDS.pendingAmount(formatCents(pendingCents))
      : null,
  ].filter((part): part is string => part !== null);
  return { text: parts.join(' · '), isFresh: updated?.isFresh ?? false };
}
