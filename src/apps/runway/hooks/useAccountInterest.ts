import { useAppSelector } from '@/store';
import { INTEREST_ACCOUNT_KINDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getMonthInterest,
  getShownBalance,
  type BalanceReading,
} from '@apps/runway/engine/interest';
import type { OpenAccount } from '@apps/runway/types';

/** This month's interest for an account and the balance to show for it; both null-ish when the account earns none. */
export function useAccountInterest(account: OpenAccount, today: number) {
  const bank = useAppSelector(
    (state) =>
      state.runway.accountBalances.find((entry) => entry.id === account.id) ??
      null,
  );
  if (
    account.apyBps === null ||
    !INTEREST_ACCOUNT_KINDS.includes(account.kind)
  ) {
    return {
      interest: null,
      shown: { cents: account.balanceCents, includesInterestCents: 0 },
    };
  }
  const now = new Date(today);
  const isLinked = account.linkId !== null;
  const readings: BalanceReading[] = [
    account.balanceCents !== null && account.balanceOn !== null
      ? { on: account.balanceOn, cents: account.balanceCents }
      : null,
    bank === null ? null : { on: todayAsUtcDate(bank.asOf), cents: bank.cents },
  ].filter((reading): reading is BalanceReading => reading !== null);
  const interest = getMonthInterest({
    balanceCents: account.balanceCents,
    apyBps: account.apyBps,
    interestDay: account.interestDay,
    isLinked,
    readings,
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
  });
  const shown = getShownBalance({
    balanceCents: account.balanceCents,
    balanceOn: account.balanceOn,
    apyBps: account.apyBps,
    interestDay: account.interestDay,
    isLinked,
    today,
  });
  return { interest, shown };
}
