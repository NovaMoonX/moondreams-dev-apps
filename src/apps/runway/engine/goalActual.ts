import { shareInterest } from '@apps/runway/engine/interest';
import type { Cents } from '@apps/runway/types';

/** A goal's planned balance beside its share of the bank's difference from the account's typed balance; information only. */
export function getGoalActual(
  goalId: string,
  goals: readonly { id: string; heldCents: Cents }[],
  accountBalanceCents: Cents,
  bankCents: Cents,
): { plannedCents: Cents; actualCents: Cents; differenceCents: Cents } {
  const plannedCents = goals.find((goal) => goal.id === goalId)?.heldCents ?? 0;
  const differenceCents =
    shareInterest(bankCents - accountBalanceCents, goals, accountBalanceCents)
      .byId[goalId] ?? 0;
  return {
    plannedCents,
    actualCents: plannedCents + differenceCents,
    differenceCents,
  };
}
