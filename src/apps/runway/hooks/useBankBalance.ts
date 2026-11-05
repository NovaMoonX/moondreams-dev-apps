import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { applyBankBalance } from '@apps/runway/store/actions/linkActions';
import type { Cents } from '@apps/runway/types';

export interface BalanceTarget {
  kind: 'account';
  id: string;
}

export interface BankBalanceOffer {
  bankCents: Cents;
  asOf: number;
  /** Null while the account has no balance typed. */
  yoursCents: Cents | null;
}

/** The bank's last figure for a linked account when it differs from the plan's own; null when they agree or the bank has said nothing. */
export function useBankBalanceOffer(target: BalanceTarget) {
  const bank = useAppSelector(
    (state) =>
      state.runway.accountBalances.find((entry) => entry.id === target.id) ??
      null,
  );
  const yoursCents = useAppSelector(
    (state) =>
      state.runway.accounts.find((entry) => entry.id === target.id)
        ?.balanceCents ?? null,
  );
  if (bank === null || bank.cents === yoursCents) return null;
  const offer: BankBalanceOffer = {
    bankCents: bank.cents,
    asOf: bank.asOf,
    yoursCents,
  };
  return offer;
}

/** Returns the action that makes an account's balance the bank's figure. */
export function useApplyBankBalance() {
  const { user } = useAuth();
  return async (target: BalanceTarget, bankCents: Cents) => {
    if (!user) return;
    await applyBankBalance(
      user.uid,
      await getRunwayEncryption(user.uid),
      target.id,
      bankCents,
    );
  };
}
