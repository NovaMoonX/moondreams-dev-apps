// Generated from src/apps/runway/engine/emailTwins.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import {
  EMAIL_MATCH_DAYS_AFTER,
  EMAIL_MATCH_DAYS_BEFORE,
  EMAIL_WAIT_DAYS,
} from './engineConstants.js';
import { DAY_MS } from './dates.js';
import { isSameStore } from './storeNames.js';
import type { OpenPurchase } from '../runwayTypes.js';

export interface EmailTwins {
  /** Emailed purchase id → the one bank charge it clearly is. */
  clear: Map<string, string>;
  /** Emailed purchases with a candidate but no clear one: several candidates, or a candidate another emailed purchase also fits. */
  ambiguous: Set<string>;
  /** Emailed purchase id → every bank charge it could be, clear or not. */
  candidates: Map<string, string[]>;
  /** Emailed store order id → the 2 to 4 bank charges, sorted, that together are it. Their charges are in `candidates` too, but the order is in neither `clear` nor `ambiguous`. */
  split: Map<string, string[]>;
}

/** The most charges one order may post as, and the most same-store charges looked through for them. */
const MAX_SPLIT_CHARGES = 4;
const MAX_SPLIT_POOL = 8;

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
  | 'merchant'
  | 'label'
  | 'storeEmail'
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

const getName = (purchase: Pick<TwinPurchase, 'merchant' | 'label'>) =>
  purchase.merchant?.trim() || purchase.label?.trim() || null;

const isWindowDay = (email: TwinPurchase, bank: TwinPurchase) =>
  bank.date >= email.date - EMAIL_MATCH_DAYS_BEFORE * DAY_MS &&
  bank.date <= email.date + EMAIL_MATCH_DAYS_AFTER * DAY_MS;

const getCombinations = <T>(items: readonly T[], size: number): T[][] =>
  size === 0
    ? [[]]
    : items.flatMap((item, index) =>
        getCombinations(items.slice(index + 1), size - 1).map((rest) => [
          item,
          ...rest,
        ]),
      );

/** The sets of 2 to 4 charges from one store, on the order's side and in its window, that add up to its amount. Empty when the pool is too big to tell. */
function findSplitSets(
  order: TwinPurchase,
  banks: readonly TwinPurchase[],
  taken: ReadonlySet<string>,
): string[][] {
  const pool = banks.filter(
    (bank) =>
      bank.amountCents > 0 &&
      !taken.has(bank.id) &&
      isSameSide(order, bank) &&
      isWindowDay(order, bank) &&
      !(order.notSameAs ?? []).includes(bank.id) &&
      isSameStore(getName(order), getName(bank)),
  );
  if (order.amountCents <= 0 || pool.length > MAX_SPLIT_POOL) return [];
  return Array.from({ length: MAX_SPLIT_CHARGES - 1 }, (_, index) => index + 2)
    .flatMap((size) => getCombinations(pool, size))
    .filter(
      (set) =>
        set.reduce((sum, bank) => sum + bank.amountCents, 0) ===
        order.amountCents,
    )
    .map((set) => set.map((bank) => bank.id).sort());
}

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
            isWindowDay(email, bank) &&
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
  const split = findSplits(emails, banks, candidates);
  return {
    clear,
    ambiguous,
    candidates: new Map([
      ...candidates,
      ...[...split].map(([emailId, ids]): [string, string[]] => [emailId, ids]),
    ]),
    split,
  };
}

/** Each waiting store order with no same-amount charge that posted as several, when exactly one set of charges is it and no other waiting email from that store could be, or could take one of the charges. */
function findSplits(
  emails: readonly TwinPurchase[],
  banks: readonly TwinPurchase[],
  candidates: ReadonlyMap<string, string[]>,
): Map<string, string[]> {
  const taken = new Set([...candidates.values()].flat());
  const sets = emails
    .filter(
      (email) =>
        email.storeEmail?.kind === 'order' &&
        (candidates.get(email.id) ?? []).length === 0,
    )
    .map((email): [TwinPurchase, string[][]] => [
      email,
      findSplitSets(email, banks, taken),
    ])
    .filter(([, found]) => found.length > 0);
  return new Map(
    sets.flatMap(([email, found]): [string, string[]][] => {
      const rivals = sets.filter(
        ([other, otherSets]) =>
          other.id !== email.id &&
          otherSets.some((set) => set.some((id) => found[0].includes(id))),
      );
      const isRivaled = emails.some(
        (other) =>
          other.id !== email.id &&
          other.amountCents === email.amountCents &&
          isSameSide(email, other) &&
          isSameStore(getName(email), getName(other)),
      );
      return found.length === 1 && rivals.length === 0 && !isRivaled
        ? [[email.id, found[0]]]
        : [];
    }),
  );
}

/** Every bank charge a waiting emailed purchase is or may be, and every emailed purchase that has one: a rule leaves both alone until they merge or the person answers, so an envelope is never charged twice. */
export const getTwinHeldIds = (twins: EmailTwins): Set<string> =>
  new Set(
    [...twins.candidates].flatMap(([emailId, bankIds]) =>
      bankIds.length > 0 ? [emailId, ...bankIds] : [],
    ),
  );

/** The bank charges that merge on their own with an email, alone or as the several an order posted as, so Needs a home never lists them. A split counts only while `canMerge` says its merge can still run. */
export const getTwinMergingIds = (
  twins: EmailTwins,
  canMerge: (emailId: string, bankIds: readonly string[]) => boolean = () =>
    true,
): Set<string> =>
  new Set([
    ...twins.clear.values(),
    ...[...twins.split].flatMap(([emailId, bankIds]) =>
      canMerge(emailId, bankIds) ? bankIds : [],
    ),
  ]);

/** One order and the charges it posted as, at the versions they are now, so a try is remembered only until one of them changes. */
export const getSplitKey = (
  banks: readonly Pick<OpenPurchase, 'id' | 'updatedAt'>[],
  email: Pick<OpenPurchase, 'id' | 'updatedAt'>,
) =>
  `${banks.map((bank) => `${bank.id}:${bank.updatedAt}`).join(',')}:${email.id}:${email.updatedAt}`;

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

/** Which card or account a purchase is on, as one key; null when it is on neither. */
export const getSideKey = (
  purchase: Pick<OpenPurchase, 'accountId' | 'paidByCardId'>,
): string | null =>
  (purchase.paidByCardId ?? null) !== null
    ? `card:${purchase.paidByCardId}`
    : purchase.accountId !== null
      ? `account:${purchase.accountId}`
      : null;

/** How many charges on a card or account must have arrived only ever posted before its bank is read as sharing no pending charges. */
export const POSTED_ONLY_MIN_CHARGES = 3;

/** The cards and accounts whose bank shares no pending charges: at least `POSTED_ONLY_MIN_CHARGES` of its charges arrived only ever posted (`wasPending` false) and none is pending now or was. A side with fewer, or only older charges with no record, is unknown, not in the set. A charge `isIgnored` says to skip (a link's history, which a first sync brings in posted) proves nothing either way. */
export function findPostedOnlySides<
  T extends Pick<
    OpenPurchase,
    'source' | 'status' | 'wasPending' | 'accountId' | 'paidByCardId'
  >,
>(
  purchases: readonly T[],
  isIgnored: (purchase: T) => boolean = () => false,
): Set<string> {
  const sides = purchases
    .filter((purchase) => purchase.source === 'link' && !isIgnored(purchase))
    .reduce((found, purchase) => {
      const key = getSideKey(purchase);
      if (key === null) return found;
      const side = found.get(key) ?? { never: 0, isPendingShared: false };
      return found.set(key, {
        never: side.never + (purchase.wasPending === false ? 1 : 0),
        isPendingShared:
          side.isPendingShared ||
          purchase.status === 'pending' ||
          purchase.wasPending === true,
      });
    }, new Map<string, { never: number; isPendingShared: boolean }>());
  return new Set(
    [...sides].flatMap(([key, side]) =>
      !side.isPendingShared && side.never >= POSTED_ONLY_MIN_CHARGES
        ? [key]
        : [],
    ),
  );
}

/** How many days after its emailed day a waiting purchase may go unmatched before it is overdue: a store order is charged when it ships, and a bank that shows nothing pending sends the charge only once it posts, so both wait as long as a charge may take to match. */
export const getEmailWaitDays = (
  purchase: Pick<OpenPurchase, 'accountId' | 'paidByCardId' | 'storeEmail'>,
  postedOnly: ReadonlySet<string>,
) => {
  const key = getSideKey(purchase);
  return purchase.storeEmail?.kind === 'order' ||
    (key !== null && postedOnly.has(key))
    ? EMAIL_MATCH_DAYS_AFTER
    : EMAIL_WAIT_DAYS;
};
