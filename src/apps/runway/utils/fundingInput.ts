import type { AmountMode } from '@/components/AmountField';
import { centsToInputValue } from '@/utils/moneyUtils';
import { FUNDING_CADENCES } from '@apps/runway/constants';
import type { FundingRule } from '@apps/runway/types';

type Cadence = (typeof FUNDING_CADENCES)[number];

/** What an envelope's or goal's form starts on when it edits a saved funding rule. */
export function toFundingInput(funding: FundingRule): {
  mode: AmountMode;
  amount: string;
  cadence: Cadence;
  dayKeys: string[];
} {
  const { amount, cadence } = funding;
  const result = {
    mode: amount.kind as AmountMode,
    amount:
      amount.kind === 'exact'
        ? centsToInputValue(amount.cents)
        : amount.kind === 'percent'
          ? String(amount.bps / 100)
          : '',
    cadence:
      cadence.kind === 'everyNth'
        ? cadence.n === 2
          ? ('every2' as const)
          : ('every3' as const)
        : cadence.kind,
    dayKeys: cadence.kind === 'chosen' ? cadence.dayKeys : [],
  };
  return result;
}
