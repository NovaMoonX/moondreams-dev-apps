import {
  formatBps,
  formatCents,
  formatCentsShort,
  parsePercentToBps,
} from '@/utils/moneyUtils';
import {
  CALENDAR_PERIOD_LABELS,
  CALENDAR_PERIOD_UNITS,
  FUNDING_PAY_WORDS,
  HOW_OFTEN_WORDS,
  PAIRING_BILL_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { ResolvedSource } from '@apps/runway/store/selectors/runwaySelectors';
import type {
  FundingAmount,
  FundingRule,
  PairingAmount,
  PriorityExtra,
} from '@apps/runway/types';
import { describePayChoice } from '@apps/runway/utils/payFrom';

export const SHARE_BPS = { full: 10_000, half: 5_000 } as const;

/** The share of the bill a "pay these first" row asks for, in basis points; null while a typed share is not a valid percent. */
export const getShareBps = (row: {
  share: 'full' | 'half' | 'other';
  amount: string;
}) =>
  row.share === 'other'
    ? parsePercentToBps(row.amount, { stepBps: 1 })
    : SHARE_BPS[row.share];

type FundedKind = 'envelope' | 'goal';

const IDLE_WORDS: Record<FundedKind, string> = {
  envelope: HOW_OFTEN_WORDS.envelopeIdle,
  goal: HOW_OFTEN_WORDS.notBeingAdded,
};

const describeCadence = (cadence: FundingRule['cadence']) => {
  if (cadence.kind === 'calendar') return CALENDAR_PERIOD_UNITS[cadence.period];
  if (cadence.kind === 'none')
    return HOW_OFTEN_WORDS.envelopeIdle.toLowerCase();
  if (cadence.kind === 'everyIncomeDay') return 'every income day';
  if (cadence.kind === 'everyNth') {
    return cadence.n === 2
      ? 'every other income day'
      : 'every third income day';
  }
  const count = cadence.dayKeys.length;
  return count === 1 ? 'on 1 chosen day' : `on ${count} chosen days`;
};

/** A funding rule read from a document written before amounts had a `kind`: a bare `{ cents }` is exact. */
export function normalizeFunding(funding: FundingRule): FundingRule {
  const amount = funding.amount as FundingAmount | { cents: number };
  if ('kind' in amount) return funding;
  const result: FundingRule = {
    ...funding,
    amount: { kind: 'exact', cents: amount.cents },
  };
  return result;
}

/** What a line asks for: "$50.00", "10% of Main job" (or "of the day's money" when no day is named), "the rest", "half the bill". */
export function describeAmount(amount: PairingAmount, of?: string) {
  if (amount.kind === 'exact') return formatCents(amount.cents);
  if (amount.kind === 'rest') return 'the rest';
  if (amount.kind === 'billShare')
    return PAIRING_BILL_WORDS.describe(amount.bps);
  const target =
    amount.of === 'remaining' ? 'what is left' : (of ?? 'each pay');
  const result = `${formatBps(amount.bps)}% of ${target}`;
  return result;
}

/** An item's extras after its own amount: ", +$250 want", or nothing without any. */
export function describeExtras(
  extras: readonly PriorityExtra[],
  format: (cents: number) => string = formatCents,
) {
  const result = extras
    .map(
      (extra) =>
        `, +${format(extra.cents)} ${PRIORITY_LABELS[extra.tier].toLowerCase()}`,
    )
    .join('');
  return result;
}

/** An envelope's funding in the words a row and a change entry share: "$50.00 every income day", "$250.00 every income day, +$250.00 want". */
export function describeFunding(
  funding: FundingRule,
  extras: readonly PriorityExtra[] = [],
  kind: FundedKind = 'envelope',
  plan?: readonly ResolvedSource[],
) {
  if (funding.cadence.kind === 'none') return IDLE_WORDS[kind].toLowerCase();
  const pay =
    funding.pay && plan
      ? ` ${FUNDING_PAY_WORDS.suffix(describePayChoice({ kind: 'pay', ...funding.pay }, plan, true))}`
      : '';
  const result = `${describeAmount(funding.amount)} ${describeCadence(funding.cadence)}${pay}${describeExtras(extras)}`;
  return result;
}

/** Why an item's own rule is not what an income day sets aside: a pairing names an amount for it (shown as "First from"). Null when none does. */
export function describePairedBy(
  pairedBy: readonly { sourceName: string; amount: PairingAmount }[],
  own?: FundingRule,
  kind: FundedKind = 'envelope',
) {
  if (pairedBy.length === 0) return null;
  if (pairedBy.length === 1) {
    const { sourceName, amount } = pairedBy[0];
    const instead = own
      ? `, instead of ${describeFundingShort(own, [], kind)}`
      : '';
    return `First from ${sourceName}: ${describeAmount(amount, sourceName)} on its income days${instead}.`;
  }
  const names = [...new Set(pairedBy.map((entry) => entry.sourceName))];
  const result = `First from ${names.join(' and ')} on their income days, in place of this rule.`;
  return result;
}

/** How often an envelope or goal is funded, as a row's line: "Every income day", "On 3 chosen days". */
export function describeCadenceLine(cadence: FundingRule['cadence']) {
  if (cadence.kind === 'calendar')
    return CALENDAR_PERIOD_LABELS[cadence.period];
  const words = describeCadence(cadence);
  const result = words.charAt(0).toUpperCase() + words.slice(1);
  return result;
}

/** A funding rule in a short line: "$200 every income day", "10% of the day's money every other income day", "$250 a month, +$250 want". */
export function describeFundingShort(
  funding: FundingRule,
  extras: readonly PriorityExtra[] = [],
  kind: FundedKind = 'envelope',
) {
  if (funding.cadence.kind === 'none') return IDLE_WORDS[kind];
  const amount =
    funding.amount.kind === 'exact'
      ? formatCentsShort(funding.amount.cents)
      : describeAmount(funding.amount);
  const result = `${amount} ${describeCadence(funding.cadence)}${describeExtras(extras, formatCentsShort)}`;
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/** "From the pay on the 30th" for a rule that comes out of one pay, for an item's sheet; null for every pay. */
export function describeFundingPayFact(
  funding: FundingRule,
  plan: readonly ResolvedSource[],
): string | null {
  if (!funding.pay || funding.cadence.kind === 'none') return null;
  const words = FUNDING_PAY_WORDS.suffix(
    describePayChoice({ kind: 'pay', ...funding.pay }, plan, true),
  );
  const result = words.charAt(0).toUpperCase() + words.slice(1);
  return result;
}
