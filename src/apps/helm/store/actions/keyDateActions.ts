import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { HELM_CAPS, WHO_LIMIT } from '@apps/helm/constants';
import {
  readIndexIn,
  readIndexOnce,
  readYearlyDateDocs,
  writeIndexIn,
  type IndexState,
} from '@apps/helm/store/actions/keyDateIndexStore';
import { readWhoTier, type WhoTierValue } from '@apps/helm/engine/whoTier';
import { openJson, sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  KeyDate,
  KeyDateKind,
  KeyDateSealed,
  MomentPrecision,
  Sealed,
} from '@apps/helm/types';
import { ALL_KEY_KINDS, MOMENT_PRECISIONS } from '@apps/helm/utils/moments';
import {
  applyChanges,
  buildByWho,
  type IndexChange,
  type IndexEntry,
} from '@apps/helm/utils/keyDateIndex';

/** What the person types for a date; a precision makes it a moment, which has no index entry. */
export interface KeyDateInput {
  kind: KeyDateKind;
  label: string | null;
  month: number | null;
  day: number | null;
  year: number | null;
  precision: MomentPrecision | null;
}

/** A change that went through, with the way to take it back; `undo` says false when the date changed since and was left alone. */
export type KeyDateChange =
  | { kind: 'done'; id: string; undo: () => Promise<boolean> }
  | { kind: 'changed' }
  | { kind: 'full'; reason: 'who' | 'all' | 'moments' }
  | { kind: 'offline' };

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const datesOf = (uid: string) => collection(userOf(uid), 'keyDates');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

const guard = async (run: () => Promise<KeyDateChange>) => {
  if (!navigator.onLine) return { kind: 'offline' } as const;
  try {
    return await run();
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' } as const;
    throw error;
  }
};

/** A date with its month known, as the sealed words and the index hold it. */
interface OpenedDate extends KeyDateInput {
  captureId: string | null;
}

const toEntry = (id: string, parts: KeyDateInput): IndexEntry => [
  id,
  parts.kind === 'anniversary' || parts.kind === 'custom'
    ? parts.kind
    : 'birthday',
  parts.month ?? 1,
  parts.day,
  parts.year,
  parts.kind === 'custom' ? parts.label : null,
];

const toSealed = (
  parts: KeyDateInput,
  captureId: string | null,
): OpenedDate => ({
  kind: parts.kind,
  label: parts.kind === 'custom' ? (parts.label?.trim() ?? null) : null,
  month: parts.month,
  day: parts.day,
  year: parts.year,
  precision: parts.precision,
  captureId,
});

const toOpened = (opened: Partial<KeyDateSealed>): OpenedDate | null => {
  const precision =
    MOMENT_PRECISIONS.find((entry) => entry === opened.precision) ?? null;
  if (precision === null && typeof opened.month !== 'number') return null;
  return {
    captureId: typeof opened.captureId === 'string' ? opened.captureId : null,
    kind: ALL_KEY_KINDS.find((entry) => entry === opened.kind) ?? 'birthday',
    label: typeof opened.label === 'string' ? opened.label : null,
    month: typeof opened.month === 'number' ? opened.month : null,
    day: typeof opened.day === 'number' ? opened.day : null,
    year: typeof opened.year === 'number' ? opened.year : null,
    precision,
  };
};

interface Step {
  id: string;
  whoId: string;
  /** What the document becomes: a new one, a new sealed payload on the existing one, or gone. */
  write:
    | { type: 'set'; fields: Omit<KeyDate, 'sealed'>; parts: OpenedDate }
    | { type: 'update'; lastEditedAt: number | null; parts: OpenedDate }
    | { type: 'delete' };
  delta: number;
  /** A moment moves `momentCount` and never touches the index. */
  isMoment: boolean;
  /** A tier the who moves to in the same write. */
  tier?: WhoTierValue;
}

/** Writes the date, the person's counter and, for a date that comes back, the index in the one transaction that has already read them. */
async function applyStep(
  transaction: Transaction,
  uid: string,
  encryption: HelmEncryption,
  index: IndexState | null,
  who: DocumentSnapshot | null,
  step: Step,
  now: number,
) {
  const ref = doc(datesOf(uid), step.id);
  const { write } = step;
  if (write.type === 'delete') {
    transaction.delete(ref);
  } else {
    const sealed = await sealJson<KeyDateSealed>(write.parts, encryption);
    if (write.type === 'set') transaction.set(ref, { ...write.fields, sealed });
    else transaction.update(ref, { sealed, lastEditedAt: write.lastEditedAt });
  }
  if (who?.exists() && (step.delta !== 0 || step.tier)) {
    const field = step.isMoment ? 'momentCount' : 'yearlyDateCount';
    transaction.update(who.ref, {
      ...(step.delta !== 0 && {
        [field]: Math.max(0, Number(who.data()?.[field] ?? 0) + step.delta),
      }),
      ...(step.tier && { tier: step.tier }),
    });
  }
  if (step.isMoment || !index) return;
  const change: IndexChange =
    write.type === 'delete'
      ? { op: 'remove', whoId: step.whoId, keyDateId: step.id }
      : {
          op: 'upsert',
          whoId: step.whoId,
          entry: toEntry(step.id, write.parts),
        };
  const next = applyChanges(index.byWho, [change]);
  await writeIndexIn(transaction, uid, encryption, {
    byWho: next.byWho,
    rebuiltAt: index.rebuiltAt,
    existingIds: index.existingIds,
    now,
  });
}

const openDate = async (
  data: DocumentData | undefined,
  encryption: HelmEncryption,
) => {
  if (!data?.sealed) return null;
  try {
    return toOpened(
      await openJson<Partial<KeyDateSealed>>(data.sealed as Sealed, encryption),
    );
  } catch {
    return null;
  }
};

/** Adds a date the person typed for a who: the document, the who's counter and the index entry in one transaction. Undo removes it, only while it is as it was left. */
export const addKeyDate = (
  uid: string,
  encryption: HelmEncryption,
  whoId: string,
  input: KeyDateInput,
) =>
  guard(async (): Promise<KeyDateChange> => {
    const ref = doc(datesOf(uid));
    const whoRef = doc(userOf(uid), 'who', whoId);
    const now = Date.now();
    const parts = toSealed(input, null);
    const outcome = await runTransaction(
      db,
      async (
        transaction,
      ): Promise<{ refused: KeyDateChange } | { isRaised: boolean }> => {
        const who = await transaction.get(whoRef);
        if (!who.exists()) return { refused: { kind: 'changed' } };
        const isMoment = input.precision !== null;
        const counted = Number(
          who.data()[isMoment ? 'momentCount' : 'yearlyDateCount'] ?? 0,
        );
        if (
          counted >=
          (isMoment ? HELM_CAPS.momentsPerWho : HELM_CAPS.yearlyPerWho)
        ) {
          return {
            refused: { kind: 'full', reason: isMoment ? 'moments' : 'who' },
          };
        }
        const index = isMoment
          ? null
          : await readIndexIn(transaction, uid, encryption);
        if (index && index.entryCount >= HELM_CAPS.keyDates) {
          return { refused: { kind: 'full', reason: 'all' } };
        }
        const tier = readWhoTier({
          tier: who.data().tier,
          tierSetBy: who.data().tierSetBy ?? 'nomos',
          mentionDayKeys: [],
          taskLinkCount: 0,
          hasRole: false,
          hasKeyDate: !isMoment,
        });
        const isRaised = !isMoment && tier !== who.data().tier;
        await applyStep(
          transaction,
          uid,
          encryption,
          index,
          who,
          {
            id: ref.id,
            whoId,
            write: {
              type: 'set',
              fields: {
                whoId,
                shape: isMoment ? 'moment' : 'yearly',
                source: 'person',
                createdBy: 'person',
                executionId: null,
                createdAt: now,
                lastEditedAt: null,
              },
              parts,
            },
            delta: 1,
            isMoment,
            ...(isRaised && { tier }),
          },
          now,
        );
        return { isRaised };
      },
    );
    if ('refused' in outcome) return outcome.refused;
    return {
      kind: 'done',
      id: ref.id,
      undo: () =>
        takeBack(
          uid,
          encryption,
          ref.id,
          whoId,
          now,
          input.precision !== null,
          outcome.isRaised,
        ),
    };
  });

/** Deletes a date only while it is still the one the person added or saved at `madeAt`. */
async function takeBack(
  uid: string,
  encryption: HelmEncryption,
  id: string,
  whoId: string,
  madeAt: number,
  isMoment: boolean,
  isTierRaised: boolean,
) {
  const ref = doc(datesOf(uid), id);
  const whoRef = doc(userOf(uid), 'who', whoId);
  return runTransaction(db, async (transaction) => {
    const [snapshot, who] = await Promise.all([
      transaction.get(ref),
      transaction.get(whoRef),
    ]);
    const data = snapshot.data() as Partial<KeyDate> | undefined;
    if (!data || (data.lastEditedAt ?? data.createdAt) !== madeAt) return false;
    const index = isMoment
      ? null
      : await readIndexIn(transaction, uid, encryption);
    await applyStep(
      transaction,
      uid,
      encryption,
      index,
      who,
      {
        id,
        whoId,
        write: { type: 'delete' },
        delta: -1,
        isMoment,
        ...(isTierRaised &&
          who.data()?.tier === 'regular' &&
          who.data()?.tierSetBy !== 'person' && { tier: 'passing' as const }),
      },
      Date.now(),
    );
    return true;
  });
}

/** Changes a date's words in one transaction that re-reads it. Undo puts the earlier words back, only while it is as it was left. */
export const editKeyDate = (
  uid: string,
  encryption: HelmEncryption,
  id: string,
  input: KeyDateInput,
) =>
  guard(async (): Promise<KeyDateChange> => {
    const ref = doc(datesOf(uid), id);
    const now = Date.now();
    const outcome = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data() as Partial<KeyDate> | undefined;
      if (
        !data ||
        typeof data.whoId !== 'string' ||
        (data.shape === 'moment') !== (input.precision !== null)
      ) {
        return null;
      }
      const isMoment = data.shape === 'moment';
      const before = await openDate(data, encryption);
      const index = isMoment
        ? null
        : await readIndexIn(transaction, uid, encryption);
      const whoId = data.whoId;
      await applyStep(
        transaction,
        uid,
        encryption,
        index,
        null,
        {
          id,
          whoId,
          write: {
            type: 'update',
            lastEditedAt: now,
            parts: toSealed(input, before?.captureId ?? null),
          },
          delta: 0,
          isMoment,
        },
        now,
      );
      return {
        whoId,
        before,
        isMoment,
        lastEditedAt: data.lastEditedAt ?? null,
      };
    });
    if (!outcome) return { kind: 'changed' };
    const { whoId, before, lastEditedAt, isMoment } = outcome;
    return {
      kind: 'done',
      id,
      undo: () =>
        runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(ref);
          const data = snapshot.data() as Partial<KeyDate> | undefined;
          if (!data || data.lastEditedAt !== now || !before) return false;
          const index = isMoment
            ? null
            : await readIndexIn(transaction, uid, encryption);
          await applyStep(
            transaction,
            uid,
            encryption,
            index,
            null,
            {
              id,
              whoId,
              write: {
                type: 'update',
                lastEditedAt,
                parts: toSealed(before, before.captureId),
              },
              delta: 0,
              isMoment,
            },
            Date.now(),
          );
          return true;
        }),
    };
  });

/** Removes a date, its entry in the index and one from the who's counter. Undo writes it back under the same id, unless one is there again. */
export const removeKeyDate = (
  uid: string,
  encryption: HelmEncryption,
  id: string,
) =>
  guard(async (): Promise<KeyDateChange> => {
    const ref = doc(datesOf(uid), id);
    const taken = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data() as DocumentData | undefined;
      if (!data || typeof data.whoId !== 'string') return null;
      const whoId = data.whoId;
      const who = await transaction.get(doc(userOf(uid), 'who', whoId));
      const isMoment = data.shape === 'moment';
      const index = isMoment
        ? null
        : await readIndexIn(transaction, uid, encryption);
      const parts = await openDate(data, encryption);
      await applyStep(
        transaction,
        uid,
        encryption,
        index,
        who,
        { id, whoId, write: { type: 'delete' }, delta: -1, isMoment },
        Date.now(),
      );
      return { data, whoId, parts, isMoment };
    });
    if (!taken) return { kind: 'changed' };
    const { data, whoId, parts, isMoment } = taken;
    return {
      kind: 'done',
      id,
      undo: () =>
        runTransaction(db, async (transaction) => {
          const [snapshot, who] = await Promise.all([
            transaction.get(ref),
            transaction.get(doc(userOf(uid), 'who', whoId)),
          ]);
          if (snapshot.exists() || !who.exists() || !parts) return false;
          const sealed = await sealJson<KeyDateSealed>(
            toSealed(parts, parts.captureId),
            encryption,
          );
          const index = isMoment
            ? null
            : await readIndexIn(transaction, uid, encryption);
          transaction.set(ref, { ...data, sealed });
          transaction.update(who.ref, {
            [isMoment ? 'momentCount' : 'yearlyDateCount']: increment(1),
          });
          if (!index) return true;
          const next = applyChanges(index.byWho, [
            { op: 'upsert', whoId, entry: toEntry(id, parts) },
          ]);
          await writeIndexIn(transaction, uid, encryption, {
            byWho: next.byWho,
            rebuiltAt: index.rebuiltAt,
            existingIds: index.existingIds,
            now: Date.now(),
          });
          return true;
        }),
    };
  });

/** One date as its sheet needs it: where it came from, whose it is and its words. */
export async function readKeyDate(
  uid: string,
  encryption: HelmEncryption,
  id: string,
) {
  const snapshot = await getDoc(doc(datesOf(uid), id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Partial<KeyDate>;
  const sealed = data.sealed
    ? await openJson<Partial<KeyDateSealed>>(data.sealed, encryption).catch(
        () => null,
      )
    : null;
  return {
    source: data.source ?? 'person',
    createdAt: data.createdAt ?? 0,
    whoId: data.whoId ?? null,
    shape: data.shape ?? 'yearly',
    parts: sealed ? toOpened(sealed) : null,
    captureId: typeof sealed?.captureId === 'string' ? sealed.captureId : null,
  };
}

/** The dates of a who as they were when it was forgotten, with the index they were read from. */
export interface TakenDates {
  docs: { id: string; data: DocumentData }[];
  index: IndexState;
  entries: IndexEntry[];
}

/** Reads a who's date documents and the index inside the transaction that forgets it; every read comes before the writes. */
export async function readWhoDatesIn(
  transaction: Transaction,
  uid: string,
  encryption: HelmEncryption,
  whoId: string,
  ids: string[],
): Promise<TakenDates> {
  const snapshots = await Promise.all(
    ids.map((id) => transaction.get(doc(datesOf(uid), id))),
  );
  const docs = snapshots.flatMap((snapshot) =>
    snapshot.exists() ? [{ id: snapshot.id, data: snapshot.data() }] : [],
  );
  const index = await readIndexIn(transaction, uid, encryption);
  return { docs, index, entries: index.byWho[whoId] ?? [] };
}

/** Deletes the documents read by `readWhoDatesIn` and takes the who out of the index. */
export async function deleteWhoDatesIn(
  transaction: Transaction,
  uid: string,
  encryption: HelmEncryption,
  whoId: string,
  taken: TakenDates,
) {
  if (taken.docs.length === 0 && taken.entries.length === 0) return;
  taken.docs.forEach(({ id }) => transaction.delete(doc(datesOf(uid), id)));
  const next = applyChanges(taken.index.byWho, [{ op: 'removeWho', whoId }]);
  await writeIndexIn(transaction, uid, encryption, {
    byWho: next.byWho,
    rebuiltAt: taken.index.rebuiltAt,
    existingIds: taken.index.existingIds,
    now: Date.now(),
  });
}

/** Writes a forgotten who's dates back under their ids, and their entries into the index; one that is there again is left alone. */
export const restoreWhoDates = (
  uid: string,
  encryption: HelmEncryption,
  whoId: string,
  taken: TakenDates,
) =>
  taken.docs.length === 0 && taken.entries.length === 0
    ? Promise.resolve()
    : runTransaction(db, async (transaction) => {
        const here = await Promise.all(
          taken.docs.map((entry) =>
            transaction.get(doc(datesOf(uid), entry.id)),
          ),
        );
        const index = await readIndexIn(transaction, uid, encryption);
        const back = taken.docs.filter(
          (_, position) => !here[position].exists(),
        );
        back.forEach(({ id, data }) =>
          transaction.set(doc(datesOf(uid), id), data),
        );
        const backIds = new Set(back.map(({ id }) => id));
        const next = applyChanges(
          index.byWho,
          taken.entries
            .filter((entry) => backIds.has(entry[0]))
            .map((entry): IndexChange => ({ op: 'upsert', whoId, entry })),
        );
        await writeIndexIn(transaction, uid, encryption, {
          byWho: next.byWho,
          rebuiltAt: index.rebuiltAt,
          existingIds: index.existingIds,
          now: Date.now(),
        });
      });

/** The ids of every date document of a who, read once before the forget's transaction. */
export const readWhoDateIds = async (uid: string, whoId: string) =>
  (await getDocs(query(datesOf(uid), where('whoId', '==', whoId)))).docs.map(
    (entry) => entry.id,
  );

const REPAIR_WHO_CAP = 400;

/** Rebuilds the index from the date documents themselves and puts each person's counter right, when the two disagreed and stayed apart. Gives up when the index changed since it was read, and the next mismatch tries again; a date of a person who is gone is left out, and nothing is repaired once the people list is too long to be read whole. */
export async function rebuildKeyDateIndex(
  uid: string,
  encryption: HelmEncryption,
  counts: Map<string, number>,
) {
  if (counts.size >= WHO_LIMIT) return;
  const before = await readIndexOnce(uid, encryption);
  const snapshot = await readYearlyDateDocs(uid);
  const records = (
    await Promise.all(
      snapshot.docs.map(async (entry) => {
        const data = entry.data();
        const opened = await openDate(data, encryption);
        return opened && typeof data.whoId === 'string'
          ? [{ whoId: data.whoId, entry: toEntry(entry.id, opened) }]
          : [];
      }),
    )
  ).flat();
  const found = buildByWho(records);
  const wrongIds = [...counts.entries()]
    .filter(([whoId, count]) => (found[whoId]?.length ?? 0) !== count)
    .map(([whoId]) => whoId);
  const readIds = [...new Set([...Object.keys(found), ...wrongIds])];
  const now = Date.now();
  await runTransaction(db, async (transaction) => {
    const [index, owners] = await Promise.all([
      readIndexIn(transaction, uid, encryption),
      Promise.all(
        readIds.map((whoId) => transaction.get(doc(userOf(uid), 'who', whoId))),
      ),
    ]);
    if (
      index.entryCount !== before.entryCount ||
      index.lastEditedAt !== before.lastEditedAt ||
      index.rebuiltAt !== before.rebuiltAt
    ) {
      return;
    }
    const here = new Set(
      owners.filter((owner) => owner.exists()).map((owner) => owner.id),
    );
    const byWho = buildByWho(records.filter(({ whoId }) => here.has(whoId)));
    owners
      .filter(
        (owner) =>
          owner.exists() &&
          Number(owner.data()?.yearlyDateCount ?? 0) !==
            (byWho[owner.id]?.length ?? 0),
      )
      .slice(0, REPAIR_WHO_CAP)
      .forEach((owner) =>
        transaction.update(owner.ref, {
          yearlyDateCount: byWho[owner.id]?.length ?? 0,
        }),
      );
    await writeIndexIn(transaction, uid, encryption, {
      byWho,
      rebuiltAt: now,
      existingIds: index.existingIds,
      now,
    });
  });
}
