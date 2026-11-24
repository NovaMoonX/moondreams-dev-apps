import { createHash } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { toComparable } from '../../vendor/optionMatchUtils.js';
import type { NormalizedTransaction } from './link/provider.js';

/**
 * The one merchant list every Runway plan shares, readable only by Functions (no rule matches this path). A document
 * holds a shop's name, https logo and Plaid category and when it was last seen, never a person, amount, date,
 * account or count of people.
 */
export const MERCHANT_NAMES_PATH = 'apps/runway/merchantNames';

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_FOR_MS = 365 * 24 * 60 * 60 * 1000;
const PRUNE_LIMIT = 200;
const BATCH_LIMIT = 400;
const MIN_KEY_LENGTH = 3;

export interface MerchantNameDoc {
  name: string;
  logo: string | null;
  category: string | null;
  seenAt: number;
}

const NOT_A_SHOP_CATEGORIES = new Set([
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
  'INCOME',
  'BANK_FEES',
]);

/** Only a charge Plaid itself recognised as a known business with a clean name teaches the list; never a transfer, loan or card payment, income or bank fee. */
export const isKnownBusiness = (raw: {
  merchantEntityId?: string | null;
  merchantName: string | null;
  categoryPrimary?: string | null;
}) =>
  Boolean(raw.merchantEntityId?.trim()) &&
  Boolean(raw.merchantName?.trim()) &&
  !NOT_A_SHOP_CATEGORIES.has(raw.categoryPrimary?.trim().toUpperCase() ?? '');

const PROCESSOR_PREFIX = /^\s*(?:sq|tst|sp|pp|paypal)\s*\*\s*/i;

/** The text a merchant is looked up by: a card processor's prefix ("SQ *") removed, everything after a later `*` or `#` and every digit dropped. Null when too little is left to mean one shop. */
export function toMerchantKey(text: string | null | undefined) {
  if (typeof text !== 'string') return null;
  const key = toComparable(
    text.replace(PROCESSOR_PREFIX, '').split(/[*#]/)[0].replace(/\d+/g, ' '),
  );
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

/** A Firestore-safe id for a key. */
export const merchantDocId = (key: string) =>
  createHash('sha256').update(key).digest('hex').slice(0, 24);

export interface MerchantEntry {
  id: string;
  name: string;
  logo: string | null;
  category: string | null;
}

const GENERIC_WORDS = new Set([
  'pos',
  'debit',
  'credit',
  'card',
  'checkcard',
  'purchase',
  'payment',
  'ach',
  'online',
  'recurring',
  'visa',
  'mastercard',
  'transfer',
  'withdrawal',
]);

/** A bank descriptor teaches the list only when it names the shop: it holds the clean name (or the reverse), or it is two or more words with no generic banking word, so a bare "SQ *COFFEE" or "POS DEBIT" never renames another shop for everyone. */
const isNamedAlias = (aliasKey: string, nameKey: string | null) => {
  if (nameKey === null || aliasKey === nameKey) return false;
  if (aliasKey.includes(nameKey) || nameKey.includes(aliasKey)) return true;
  const words = aliasKey.split(' ').filter(Boolean);
  return words.length >= 2 && !words.some((word) => GENERIC_WORDS.has(word));
};

/** One entry per distinct key: the clean name and the bank's own descriptor as an alias, both carrying the same display fields. The first of a key keeps its place, but one with a logo wins. */
export function toMerchantEntries(
  transactions: readonly Pick<
    NormalizedTransaction,
    'merchant' | 'merchantLogo' | 'bankName' | 'category' | 'isKnownBusiness'
  >[],
) {
  const entries = transactions
    .filter(({ isKnownBusiness: isKnown, merchant }) => isKnown && merchant)
    .flatMap(({ merchant, merchantLogo, bankName, category }) =>
      [merchant, bankName].flatMap((text, index): MerchantEntry[] => {
        const key = toMerchantKey(text);
        return key === null ||
          (index === 1 && !isNamedAlias(key, toMerchantKey(merchant)))
          ? []
          : [
              {
                id: merchantDocId(key),
                name: (merchant as string).slice(0, 100),
                logo: merchantLogo,
                category,
              },
            ];
      }),
    );
  return [
    ...entries
      .reduce(
        (byId, entry) =>
          byId.get(entry.id)?.logo ? byId : byId.set(entry.id, entry),
        new Map<string, MerchantEntry>(),
      )
      .values(),
  ];
}

/** What to write for an entry, or null when the stored document already says it and was seen within the week. A field Plaid sends empty keeps the stored value, so a missing logo never erases one. */
export function toMerchantWrite(
  entry: MerchantEntry,
  stored: Partial<MerchantNameDoc> | undefined,
  now: number,
): MerchantNameDoc | null {
  const next = {
    name: entry.name,
    logo: entry.logo ?? stored?.logo ?? null,
    category: entry.category ?? stored?.category ?? null,
  };
  const isSame =
    stored !== undefined &&
    stored.name === next.name &&
    (stored.logo ?? null) === next.logo &&
    (stored.category ?? null) === next.category &&
    typeof stored.seenAt === 'number' &&
    now - stored.seenAt < REFRESH_AFTER_MS;
  return isSame ? null : { ...next, seenAt: now };
}

/** Keeps the list current from one page of bank charges. Never throws: the sync must not wait on or fail for it. */
export async function learnMerchants(
  firestore: Firestore,
  transactions: readonly NormalizedTransaction[],
  now: number,
) {
  try {
    const entries = toMerchantEntries(transactions);
    if (entries.length === 0) return;
    const refs = entries.map(({ id }) =>
      firestore.doc(`${MERCHANT_NAMES_PATH}/${id}`),
    );
    const stored = await firestore.getAll(...refs);
    const writes = entries.flatMap((entry, index) => {
      const next = toMerchantWrite(
        entry,
        stored[index].data() as Partial<MerchantNameDoc> | undefined,
        now,
      );
      return next === null ? [] : [{ ref: refs[index], data: next }];
    });
    const batches = Array.from(
      { length: Math.ceil(writes.length / BATCH_LIMIT) },
      (_, at) => writes.slice(at * BATCH_LIMIT, (at + 1) * BATCH_LIMIT),
    );
    await batches.reduce(async (done, batch) => {
      await done;
      const write = firestore.batch();
      batch.forEach(({ ref, data }) => write.set(ref, data));
      await write.commit();
    }, Promise.resolve());
  } catch {
    logger.warn('runway.merchantNames.learnFailed');
  }
}

export type Known = Pick<MerchantNameDoc, 'name' | 'logo' | 'category'>;

const toKnown = (found: Partial<MerchantNameDoc>, name: string): Known => ({
  name,
  logo: typeof found.logo === 'string' ? found.logo : null,
  category: typeof found.category === 'string' ? found.category : null,
});

/** The list's entry for text read from an email, or null when there is none or the list can't be read. */
export async function findMerchant(
  firestore: Firestore,
  text: string | null | undefined,
): Promise<Known | null> {
  const key = toMerchantKey(text);
  if (key === null) return null;
  try {
    const found = (
      await firestore.doc(`${MERCHANT_NAMES_PATH}/${merchantDocId(key)}`).get()
    ).data() as Partial<MerchantNameDoc> | undefined;
    return found && typeof found.name === 'string' && found.name !== ''
      ? toKnown(found, found.name)
      : null;
  } catch {
    logger.warn('runway.merchantNames.lookupFailed');
    return null;
  }
}

/** The list's entries for several texts at once (one read), keyed by the text given; a text with no entry is left out. Null when the list can't be read, so a caller never takes an outage for a miss. */
export async function findMerchants(
  firestore: Firestore,
  texts: readonly (string | null)[],
) {
  const wanted = [...new Set(texts)].flatMap((text) => {
    const key = toMerchantKey(text);
    return text === null || key === null
      ? []
      : [
          {
            text,
            ref: firestore.doc(`${MERCHANT_NAMES_PATH}/${merchantDocId(key)}`),
          },
        ];
  });
  if (wanted.length === 0) return new Map<string, Known>();
  try {
    const snapshots = await firestore.getAll(...wanted.map(({ ref }) => ref));
    return new Map(
      snapshots.flatMap((snapshot, index): [string, Known][] => {
        const found = snapshot.data() as Partial<MerchantNameDoc> | undefined;
        return found && typeof found.name === 'string' && found.name !== ''
          ? [[wanted[index].text, toKnown(found, found.name)]]
          : [];
      }),
    );
  } catch {
    logger.warn('runway.merchantNames.lookupFailed');
    return null;
  }
}

/** Deletes shops not seen for a year, a small capped batch per call. Never throws. */
export async function pruneMerchants(firestore: Firestore, now: number) {
  try {
    const old = await firestore
      .collection(MERCHANT_NAMES_PATH)
      .where('seenAt', '<', now - KEEP_FOR_MS)
      .limit(PRUNE_LIMIT)
      .get();
    if (old.empty) return;
    const batch = firestore.batch();
    old.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    logger.info('runway.merchantNames.pruned', { count: old.size });
  } catch {
    logger.warn('runway.merchantNames.pruneFailed');
  }
}
