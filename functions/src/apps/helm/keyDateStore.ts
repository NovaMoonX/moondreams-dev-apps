import { logger } from 'firebase-functions';
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import {
  countEntries,
  INDEX_DOC,
  mergeMonths,
  MONTH_DOC_IDS,
  planIndexWrite,
  type ByWho,
  type IndexEntry,
} from './keyDateIndex.js';
import {
  formatYearlyDate,
  nextYearlyOccurrence,
} from '../../vendor/yearlyDateUtils.js';
import { openForHelm, type HelmKey } from './helmKey.js';

export interface IndexState {
  byWho: ByWho;
  entryCount: number;
  rebuiltAt: number | null;
  lastEditedAt: number | null;
  /** The index documents that exist now, so a write can delete the ones it replaces. */
  existingIds: string[];
}

const EMPTY: IndexState = {
  byWho: {},
  entryCount: 0,
  rebuiltAt: null,
  lastEditedAt: null,
  existingIds: [],
};

const isEntry = (value: unknown): value is IndexEntry =>
  Array.isArray(value) &&
  typeof value[0] === 'string' &&
  typeof value[2] === 'number';

const toByWho = (key: HelmKey, sealed: unknown): ByWho => {
  const words = openForHelm(key, sealed as SealedPayload);
  const raw = (words.byWho ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(raw).flatMap(([whoId, entries]) => {
      const kept = Array.isArray(entries) ? entries.filter(isEntry) : [];
      return kept.length > 0 ? [[whoId, kept]] : [];
    }),
  );
};

const refsOf = (firestore: Firestore, base: string) => ({
  single: firestore.doc(`${base}/meta/${INDEX_DOC}`),
  months: MONTH_DOC_IDS.map((id) => firestore.doc(`${base}/meta/${id}`)),
});

interface Snap {
  exists: boolean;
  id: string;
  get: (field: string) => unknown;
}

const toState = (key: HelmKey, snaps: Snap[]): IndexState => {
  const present = snaps.filter((snap) => snap.exists);
  if (present.length === 0) return EMPTY;
  const parts = present.map((snap) => toByWho(key, snap.get('sealed')));
  const byWho = parts.length === 1 ? parts[0] : mergeMonths(parts);
  const latestOf = (field: string) => {
    const times = present
      .map((snap) => snap.get(field))
      .filter((value): value is number => typeof value === 'number');
    return times.length > 0 ? Math.max(...times) : null;
  };
  return {
    byWho,
    entryCount: countEntries(byWho),
    rebuiltAt: latestOf('rebuiltAt'),
    lastEditedAt: latestOf('lastEditedAt'),
    existingIds: present.map((snap) => snap.id),
  };
};

/** Reads the index in a transaction: the single document, else the twelve month documents. */
export async function readIndexIn(
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
): Promise<IndexState> {
  const { single, months } = refsOf(firestore, base);
  const first = await transaction.get(single);
  if (first.exists) return toState(key, [first]);
  const rest = await transaction.getAll(...months);
  return toState(key, rest);
}

/** Reads the index outside a transaction. */
export async function readIndexOnce(
  firestore: Firestore,
  base: string,
  key: HelmKey,
): Promise<IndexState> {
  const { single, months } = refsOf(firestore, base);
  const first = await single.get();
  if (first.exists) return toState(key, [first]);
  return toState(key, await firestore.getAll(...months));
}

/** Writes the index in the same transaction as the change: the single document, or the twelve month documents once it passes the split, deleting what it replaces. */
export function writeIndexIn(
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  input: {
    byWho: ByWho;
    rebuiltAt: number | null;
    existingIds: string[];
    now: number;
    seal: (fields: Record<string, unknown>) => SealedPayload;
  },
) {
  const plan = planIndexWrite(input.byWho);
  const refOf = (id: string): DocumentReference =>
    firestore.doc(`${base}/meta/${id}`);
  plan.docs.forEach((entry) =>
    transaction.set(refOf(entry.id), {
      entryCount: entry.entryCount,
      rebuiltAt: input.rebuiltAt,
      lastEditedAt: input.now,
      sealed: input.seal({ byWho: entry.byWho }),
    }),
  );
  plan.deleteIds
    .filter((id) => input.existingIds.includes(id))
    .forEach((id) => transaction.delete(refOf(id)));
}

/** A date of someone the turn names, for the model to answer from and to change. */
export interface ContextKeyDate {
  id: string;
  who: string;
  kind: string;
  label: string | null;
  when: string;
  isPrivate?: boolean;
}

/** One of the next dates that come back, for a question about what is coming up. */
export interface ContextUpcoming {
  who: string;
  what: string;
  on: string;
  isPrivate?: boolean;
}

const ABOUT_DATES_RE =
  /birthday|anniversar|gotcha|born on|coming up|upcoming|turn(?:s|ing)?\s+\d/i;
const ABOUT_UPCOMING_RE =
  /coming up|upcoming|anything|what's|whats|what is|which|who|next|this week|\bin\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const MAX_NAMED_READS = 300;
const MAX_CONTEXT_DATES = 30;
const MAX_UPCOMING = 30;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const whatOf = (kind: string, label: string | null) =>
  kind === 'custom' ? (label ?? 'date') : kind;

/** The dates of the people the words name (and of the person, when they say "my"), and the next dates that come back when the words ask what is coming up. The index is opened once; a failed read gives none, so a turn never waits on it. */
export async function readContextKeyDates(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  input: { text: string; selfWhoId: string | null; todayKey: string },
): Promise<{ keyDates: ContextKeyDate[]; upcoming: ContextUpcoming[] }> {
  const none = { keyDates: [], upcoming: [] };
  if (!ABOUT_DATES_RE.test(input.text)) return none;
  try {
    const index = await readIndexOnce(firestore, base, key);
    const whoIds = Object.keys(index.byWho).slice(0, MAX_NAMED_READS);
    if (whoIds.length === 0) return none;
    const snaps = await firestore.getAll(
      ...whoIds.map((id) => firestore.doc(`${base}/who/${id}`)),
    );
    const names = new Map(
      snaps.flatMap((snap): [string, string[]][] => {
        if (!snap.exists) return [];
        try {
          const words = openForHelm(key, snap.get('sealed') as SealedPayload);
          const listed = [
            words.name,
            ...(Array.isArray(words.aliases) ? words.aliases : []),
          ].filter((name): name is string => typeof name === 'string');
          return [[snap.id, listed]];
        } catch {
          return [];
        }
      }),
    );
    const isNamed = (id: string) =>
      (names.get(id) ?? []).some(
        (name) =>
          name.trim() !== '' &&
          new RegExp(
            `(^|[^\\p{L}\\p{N}])${escapeRegExp(name.trim())}($|[^\\p{L}\\p{N}])`,
            'iu',
          ).test(input.text),
      );
    const privateWho = new Set(
      snaps.flatMap((snap) =>
        snap.exists && snap.get('privacy') === 'private' ? [snap.id] : [],
      ),
    );
    const displayOf = (id: string) =>
      id === input.selfWhoId ? 'You' : (names.get(id)?.[0] ?? '');
    const isMine = /\b(my|our|i|me)\b/i.test(input.text);
    const entries = Object.entries(index.byWho).flatMap(([whoId, list]) =>
      list.map((entry) => ({ whoId, entry })),
    );
    const keyDates = entries
      .filter(
        ({ whoId }) => isNamed(whoId) || (isMine && whoId === input.selfWhoId),
      )
      .slice(0, MAX_CONTEXT_DATES)
      .map(({ whoId, entry }) => ({
        id: entry[0],
        who: displayOf(whoId),
        kind: entry[1],
        label: entry[5],
        isPrivate: privateWho.has(whoId),
        when: formatYearlyDate({
          month: entry[2],
          day: entry[3],
          year: entry[4],
        }),
      }));
    const upcoming = ABOUT_UPCOMING_RE.test(input.text)
      ? entries
          .flatMap(({ whoId, entry }) =>
            entry[3] === null || !names.has(whoId)
              ? []
              : [
                  {
                    on: nextYearlyOccurrence(
                      { month: entry[2], day: entry[3] },
                      input.todayKey,
                    ),
                    who: displayOf(whoId),
                    what: whatOf(entry[1], entry[5]),
                    isPrivate: privateWho.has(whoId),
                  },
                ],
          )
          .sort((a, b) => a.on.localeCompare(b.on))
          .slice(0, MAX_UPCOMING)
      : [];
    return { keyDates, upcoming };
  } catch (error) {
    logger.error('helm.keyDates.contextUnreadable', {
      message: error instanceof Error ? error.message : String(error),
    });
    return none;
  }
}
