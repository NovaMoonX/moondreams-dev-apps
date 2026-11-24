// Generated from src/apps/runway/engine/emailTwins.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import {
  EMAIL_MATCH_DAYS_AFTER,
  EMAIL_MATCH_DAYS_BEFORE,
} from './engineConstants.js';
import { DAY_MS } from './dates.js';
import type { OpenPurchase } from '../runwayTypes.js';

export interface EmailTwins {
  /** Emailed purchase id → the one bank charge it clearly is. */
  clear: Map<string, string>;
  /** Emailed purchases with a candidate but no clear one: several candidates, or a candidate another emailed purchase also fits. */
  ambiguous: Set<string>;
  /** Emailed purchase id → every bank charge it could be, clear or not. */
  candidates: Map<string, string[]>;
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
  return { clear, ambiguous, candidates };
}

/** Every bank charge a waiting emailed purchase is or may be, and every emailed purchase that has one: a rule leaves both alone until they merge or the person answers, so an envelope is never charged twice. */
export const getTwinHeldIds = (twins: EmailTwins): Set<string> =>
  new Set(
    [...twins.candidates].flatMap(([emailId, bankIds]) =>
      bankIds.length > 0 ? [emailId, ...bankIds] : [],
    ),
  );

/** The bank charges that merge on their own with an email, so Needs a home never lists them. */
export const getTwinMergingIds = (twins: EmailTwins): Set<string> =>
  new Set(twins.clear.values());

/** The waiting emailed purchases a bank charge may be, when none of them is clearly it. */
export const getEmailOffers = (twins: EmailTwins, bankId: string): string[] =>
  [...twins.ambiguous]
    .filter((emailId) => twins.candidates.get(emailId)?.includes(bankId))
    .sort();

/** An emailed purchase the person or a rule has answered: it left Needs a home with an envelope, a rule or the person's own say. A legacy one (free lines, nobody's answer) is not, and a merge keeps the bank charge's own state. */
export const isAnsweredEmail = (
  purchase: Pick<OpenPurchase, 'needsHome' | 'lines' | 'assignedBy' | 'ruleId'>,
) =>
  !purchase.needsHome &&
  (purchase.lines.some((line) => line.envelopeId !== null) ||
    purchase.assignedBy !== null ||
    purchase.ruleId !== null);

/** A bank charge already settled by the person (placed, kept, left out) or matched to a bill or a pair, rather than one waiting or placed by a rule: its own state wins over an email's. */
export const isSettledByPerson = (
  purchase: Pick<
    OpenPurchase,
    'needsHome' | 'assignedBy' | 'billRef' | 'pairedWithId'
  >,
) =>
  !purchase.needsHome &&
  (purchase.assignedBy !== 'auto' ||
    (purchase.billRef ?? null) !== null ||
    purchase.pairedWithId !== null);
