import {
  EMAIL_MATCH_DAYS_AFTER,
  EMAIL_MATCH_DAYS_BEFORE,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import type { OpenPurchase } from '@apps/runway/types';

export interface EmailTwins {
  /** Emailed purchase id → the one bank charge it clearly is. */
  clear: Map<string, string>;
  /** Emailed purchases with a candidate but no clear one: several candidates, or a candidate another emailed purchase also fits. */
  ambiguous: Set<string>;
}

type TwinPurchase = Pick<
  OpenPurchase,
  | 'id'
  | 'date'
  | 'source'
  | 'amountCents'
  | 'accountId'
  | 'paidByCardId'
  | 'emailWaiting'
  | 'notSameAs'
  | 'pairedWithId'
>;

/** An emailed purchase still waiting for its bank. */
export const isWaitingEmail = (
  purchase: Pick<OpenPurchase, 'source' | 'emailWaiting'>,
) => purchase.source === 'email' && purchase.emailWaiting === true;

const isSameSide = (email: TwinPurchase, bank: TwinPurchase) =>
  (email.paidByCardId ?? null) !== null
    ? email.paidByCardId === (bank.paidByCardId ?? null)
    : email.accountId !== null &&
      email.accountId === bank.accountId &&
      (bank.paidByCardId ?? null) === null;

/** Pairs each emailed purchase still waiting with the bank charge it clearly is: the same amount on the same card (or the same account for money out of an account), dated from two days before to seven days after the emailed day, and the only one either way. A charge the person said is not it, or one paired as a move between accounts, is never a candidate. The result does not depend on the order of the input. */
export function findEmailTwins(purchases: readonly TwinPurchase[]): EmailTwins {
  const emails = purchases.filter(isWaitingEmail);
  const banks = purchases.filter(
    (purchase) =>
      purchase.source === 'link' && (purchase.pairedWithId ?? null) === null,
  );
  const candidates = new Map(
    emails.map((email) => [
      email.id,
      banks
        .filter(
          (bank) =>
            bank.amountCents === email.amountCents &&
            isSameSide(email, bank) &&
            bank.date >= email.date - EMAIL_MATCH_DAYS_BEFORE * DAY_MS &&
            bank.date <= email.date + EMAIL_MATCH_DAYS_AFTER * DAY_MS &&
            !(email.notSameAs ?? []).includes(bank.id),
        )
        .map((bank) => bank.id),
    ]),
  );
  const claims = [...candidates.values()]
    .flat()
    .reduce(
      (counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1),
      new Map<string, number>(),
    );
  const clear = new Map(
    [...candidates].flatMap(([emailId, ids]): [string, string][] =>
      ids.length === 1 && claims.get(ids[0]) === 1 ? [[emailId, ids[0]]] : [],
    ),
  );
  const ambiguous = new Set(
    [...candidates]
      .filter(([emailId, ids]) => ids.length > 0 && !clear.has(emailId))
      .map(([emailId]) => emailId),
  );
  return { clear, ambiguous };
}
