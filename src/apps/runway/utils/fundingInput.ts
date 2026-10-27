import type { AmountMode } from '@/components/AmountField';
import { centsToInputValue } from '@/utils/moneyUtils';
import type { CALENDAR_PERIODS } from '@apps/runway/constants';
import type { FundingRule } from '@apps/runway/types';

type PaycheckCadence = 'everyIncomeDay' | 'every2' | 'every3' | 'chosen';
/** The answer to "How often?": a calendar period, a share of each pay, or (for a goal) nothing. */
export type HowOften = (typeof CALENDAR_PERIODS)[number] | 'paycheck' | 'none';

/** What an envelope's or goal's form starts on when it edits a saved funding rule. */
export function toFundingInput(funding: FundingRule): {
  mode: AmountMode;
  amount: string;
  often: HowOften;
  cadence: PaycheckCadence;
  dayKeys: string[];
  sourceId: string | null;
} {
  const { amount, cadence } = funding;
  const often: HowOften =
    cadence.kind === 'calendar'
      ? cadence.period
      : cadence.kind === 'none'
        ? 'none'
        : 'paycheck';
  const result = {
    mode: amount.kind as AmountMode,
    amount:
      amount.kind === 'exact'
        ? amount.cents > 0
          ? centsToInputValue(amount.cents)
          : ''
        : amount.kind === 'percent'
          ? String(amount.bps / 100)
          : '',
    often,
    cadence:
      cadence.kind === 'everyNth'
        ? cadence.n === 2
          ? ('every2' as const)
          : ('every3' as const)
        : cadence.kind === 'chosen'
          ? ('chosen' as const)
          : ('everyIncomeDay' as const),
    dayKeys: cadence.kind === 'chosen' ? cadence.dayKeys : [],
    sourceId: funding.sourceId ?? null,
  };
  return result;
}
