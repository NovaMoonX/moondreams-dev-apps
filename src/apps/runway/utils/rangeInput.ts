import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { STANCE_FOLLOW_PLAN } from '@apps/runway/constants';
import type { MoneyRange, Stance } from '@apps/runway/types';

/** What a form holds for an amount: one figure, or a low and a high end, and the stance this item plans at. */
export interface AmountDraft {
  mode: 'exact' | 'range';
  low: string;
  high: string;
  stance: typeof STANCE_FOLLOW_PLAN | Stance;
}

export const EMPTY_AMOUNT_DRAFT: AmountDraft = {
  mode: 'exact',
  low: '',
  high: '',
  stance: STANCE_FOLLOW_PLAN,
};

/** The range a draft holds, equal ends for an exact amount; null while it is not a positive amount or a range with a higher top. */
export function parseAmountDraft(draft: AmountDraft): MoneyRange | null {
  const low = parseMoneyToCents(draft.low);
  if (low === null || low <= 0) return null;
  if (draft.mode === 'exact') return { lowCents: low, highCents: low };
  const high = parseMoneyToCents(draft.high);
  if (high === null || high <= low) return null;
  return { lowCents: low, highCents: high };
}

/** The item's own stance, null when it follows the plan or the amount is exact. */
export const getStanceOverride = (draft: AmountDraft): Stance | null =>
  draft.mode === 'range' && draft.stance !== STANCE_FOLLOW_PLAN
    ? draft.stance
    : null;

/** The draft a form starts on when it edits an amount that is already saved. */
export function toAmountDraft(
  range: MoneyRange,
  stanceOverride: Stance | null,
): AmountDraft {
  const isExact = range.lowCents === range.highCents;
  const result: AmountDraft = {
    mode: isExact ? 'exact' : 'range',
    low: centsToInputValue(range.lowCents),
    high: isExact ? '' : centsToInputValue(range.highCents),
    stance: stanceOverride ?? STANCE_FOLLOW_PLAN,
  };
  return result;
}

/** "$150.00", or "$100.00 to $140.00" for a range; empty while it is not a whole amount. */
export function describeAmountDraft(draft: AmountDraft): string {
  const range = parseAmountDraft(draft);
  if (range === null) return '';
  const result =
    range.lowCents === range.highCents
      ? formatCents(range.lowCents)
      : `${formatCents(range.lowCents)} to ${formatCents(range.highCents)}`;
  return result;
}
