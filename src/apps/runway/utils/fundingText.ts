import { formatCents } from '@/utils/moneyUtils';
import type { FundingRule } from '@apps/runway/types';

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

/** An envelope's funding in the words a row and a change entry share: "$50.00 every income day". */
export function describeFunding(funding: FundingRule) {
  const result = `${formatCents(funding.amount.cents)} ${describeCadence(funding.cadence)}`;
  return result;
}
