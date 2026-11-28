import {
  EMAIL_MATCH_DAYS_AFTER,
  EMAIL_MATCH_DAYS_BEFORE,
  EMAIL_ORDER_MATCH_DAYS_AFTER,
  EMAIL_WAIT_DAYS,
} from './engineConstants';
import { DAY_MS } from '@apps/runway/engine/dates';
import { getMerchantWords, isSameStore } from '@apps/runway/engine/storeNames';
import type { OpenPurchase } from '@apps/runway/types';

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
  | 'emailWaitUntil'
>;

/** An emailed purchase still waiting for its bank. */
export const isWaitingEmail = (
  purchase: Pick<OpenPurchase, 'source' | 'emailWaiting'>,
) => purchase.source === 'email' && purchase.emailWaiting === true;

const getName = (purchase: Pick<TwinPurchase, 'merchant' | 'label'>) =>
  purchase.merchant?.trim() || purchase.label?.trim() || null;

// A store's order often names no card (a virtual card, a gift balance), so its side is any card or account the same store charged.
const isSameSide = (email: TwinPurchase, bank: TwinPurchase) =>
  (email.paidByCardId ?? null) !== null
    ? email.paidByCardId === (bank.paidByCardId ?? null)
    : email.accountId !== null
      ? email.accountId === bank.accountId &&
        (bank.paidByCardId ?? null) === null
      : email.storeEmail?.kind === 'order' &&
        isSameStore(getName(email), getName(bank));

/** The last day a bank charge may be dated and still be this emailed purchase: seven days on, thirty for a store's order (charged when it ships), or the day the person chose to keep waiting until, whichever is later. */
export const getEmailWindowEnd = (
  email: Pick<OpenPurchase, 'date' | 'storeEmail' | 'emailWaitUntil'>,
) =>
  Math.max(
    email.date +
      (email.storeEmail?.kind === 'order'
        ? EMAIL_ORDER_MATCH_DAYS_AFTER
        : EMAIL_MATCH_DAYS_AFTER) *
        DAY_MS,
    email.emailWaitUntil ?? 0,
  );

const isWindowDay = (
  email: Pick<OpenPurchase, 'date' | 'storeEmail' | 'emailWaitUntil'>,
  bank: Pick<OpenPurchase, 'date'>,
) =>
  bank.date >= email.date - EMAIL_MATCH_DAYS_BEFORE * DAY_MS &&
  bank.date <= getEmailWindowEnd(email);

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

/** Pairs each emailed purchase still waiting with the bank charge it clearly is: the same amount on the same card (or the same account for money out of an account, or for a store order that names neither, any charge from the same store), dated from two days before the emailed day to the end of its window (`getEmailWindowEnd`), and the only one either way. A charge the person said is not it, or one paired as a move between accounts, is never a candidate. The result does not depend on the order of the input. */
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
  return purchase.storeEmail?.kind === 'order'
    ? EMAIL_ORDER_MATCH_DAYS_AFTER
    : key !== null && postedOnly.has(key)
      ? EMAIL_MATCH_DAYS_AFTER
      : EMAIL_WAIT_DAYS;
};

/** The last day a waiting emailed purchase is not yet overdue: its wait (`getEmailWaitDays`) after the emailed day, or the day the person chose to keep waiting until, whichever is later. */
export const getEmailWaitEnd = (
  purchase: Pick<
    OpenPurchase,
    'date' | 'accountId' | 'paidByCardId' | 'storeEmail' | 'emailWaitUntil'
  >,
  postedOnly: ReadonlySet<string>,
) =>
  Math.max(
    purchase.date + getEmailWaitDays(purchase, postedOnly) * DAY_MS,
    purchase.emailWaitUntil ?? 0,
  );

// A bank's alert names the store its own way ("AMAZON MKTPL*AB12C" for an Amazon order), so a join also takes a shared first word of four letters or more.
// A bank's alert names a store its own way ("AMAZON MKTPL*AB12C"): the store's whole name, then a processor code marked by * or #. A plain extra word ("Target Optical", "Home Goods") is another store.
const isJoinStore = (order: string | null, alert: string | null) => {
  if (isSameStore(order, alert)) return true;
  const store = getMerchantWords(order);
  const words = getMerchantWords(alert);
  return (
    store.join('').length >= 4 &&
    words.length > store.length &&
    store.every((word, index) => words[index] === word) &&
    /[*#]/.test(alert ?? '')
  );
};

/** A waiting store order that names no card or account (a virtual card, a gift balance). */
const isCardlessOrder = (purchase: TwinPurchase) =>
  isWaitingEmail(purchase) &&
  purchase.storeEmail?.kind === 'order' &&
  (purchase.paidByCardId ?? null) === null &&
  purchase.accountId === null;

/** A waiting purchase read from a bank's alert, on a known card or account. */
const isBankAlert = (purchase: TwinPurchase) =>
  isWaitingEmail(purchase) &&
  (purchase.storeEmail ?? null) === null &&
  ((purchase.paidByCardId ?? null) !== null || purchase.accountId !== null);

/** Pairs each waiting store order that names no card with the bank alert email that is clearly the same purchase, so the two become one that keeps both emails: the same amount, the same store, the alert dated from two days before the order to the end of the order's window, neither told it is not the other, not both already placed (the person decides between two answers), and the only one either way. Order id → alert id. The result does not depend on the order of the input. */
export function findEmailJoins(
  purchases: readonly (TwinPurchase &
    Pick<OpenPurchase, 'needsHome' | 'lines' | 'assignedBy' | 'ruleId'>)[],
): Map<string, string> {
  const orders = purchases.filter(isCardlessOrder);
  const alerts = purchases.filter(isBankAlert);
  const candidates = new Map(
    orders.map((order) => [
      order.id,
      alerts
        .filter(
          (alert) =>
            alert.amountCents === order.amountCents &&
            order.amountCents > 0 &&
            isJoinStore(getName(order), getName(alert)) &&
            isWindowDay(order, alert) &&
            !(order.notSameAs ?? []).includes(alert.id) &&
            !(alert.notSameAs ?? []).includes(order.id) &&
            !(isAnsweredEmail(order) && isAnsweredEmail(alert)),
        )
        .map((alert) => alert.id),
    ]),
  );
  const claims = [...candidates.values()]
    .flat()
    .reduce(
      (counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1),
      new Map<string, number>(),
    );
  return new Map(
    [...candidates].flatMap(([orderId, ids]): [string, string][] =>
      ids.length === 1 && claims.get(ids[0]) === 1 ? [[orderId, ids[0]]] : [],
    ),
  );
}
