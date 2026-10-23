import { formatBps, formatCents } from '@/utils/moneyUtils';
import type { FundingAmount, FundingRule } from '@apps/runway/types';

const describeCadence = (cadence: FundingRule['cadence']) => {
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

/** What a line asks for: "$50.00", "10% of Main job" (or "of the day's money" when no day is named), "the rest". */
export function describeAmount(amount: FundingAmount, of?: string) {
  if (amount.kind === 'exact') return formatCents(amount.cents);
  if (amount.kind === 'rest') return 'the rest';
  const target =
    amount.of === 'remaining' ? 'what is left' : (of ?? "the day's money");
  const result = `${formatBps(amount.bps)}% of ${target}`;
  return result;
}

/** An envelope's funding in the words a row and a change entry share: "$50.00 every income day". */
export function describeFunding(funding: FundingRule) {
  const result = `${describeAmount(funding.amount)} ${describeCadence(funding.cadence)}`;
  return result;
}
