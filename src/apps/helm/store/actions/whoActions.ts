import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  type DocumentData,
  getDoc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { openJson, sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  HelmProfile,
  Sealed,
  Who,
  WhoKind,
  WhoSealed,
  WhoTier,
} from '@apps/helm/types';

const CHUNK = 200;

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

export type EditResult = 'saved' | 'offline' | 'missing' | 'unreadable';

/** The fields a person edits on a who: its sealed words and its kind. */
export interface WhoEdit {
  name: string;
  aliases: string[];
  kind: WhoKind;
  relation: string | null;
  species: string | null;
  organizationKind: string | null;
  phone: string | null;
  email: string | null;
}

/** Changes a who's name, kind and contact details in one transaction that re-reads it, so notes and anything changed on another device meanwhile are kept. Needs a connection. */
export async function updateWho(
  uid: string,
  encryption: HelmEncryption,
  whoId: string,
  edit: WhoEdit,
): Promise<EditResult> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(userOf(uid), 'who', whoId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<EditResult> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return 'missing';
        const opened = await openJson<WhoSealed>(
          (snapshot.data() as Who).sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return 'unreadable';
        const { kind, ...words } = edit;
        const sealed = await sealJson<WhoSealed>(
          { ...opened, ...words },
          encryption,
        );
        transaction.update(ref, { sealed, kind, lastEditedAt: Date.now() });
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

/** A level the person picks is theirs: the assistant never changes it after. */
export const setWhoTier = (uid: string, whoId: string, tier: WhoTier) =>
  updateDoc(doc(userOf(uid), 'who', whoId), {
    tier,
    tierSetBy: 'person',
    lastEditedAt: Date.now(),
  });

type LinkSource = 'tasks' | 'captures' | 'who';

/** Where each kind of record is linked from, and by which field. */
const LINKED_FROM: Record<
  'who' | 'places',
  { source: LinkSource; field: 'whoIds' | 'placeIds' }[]
> = {
  who: [
    { source: 'tasks', field: 'whoIds' },
    { source: 'captures', field: 'whoIds' },
  ],
  places: [
    { source: 'tasks', field: 'placeIds' },
    { source: 'captures', field: 'placeIds' },
    { source: 'who', field: 'placeIds' },
  ],
};

export interface ForgetCounts {
  tasks: number;
  captures: number;
  who: number;
}

export type RestoreOutcome = 'restored' | 'exists';

export interface Forgotten {
  counts: ForgetCounts;
  /** Puts the record back and its id on the records it was taken from that still exist. */
  restore: () => Promise<RestoreOutcome>;
}

const toChunks = (ids: string[]) =>
  Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, index) =>
    ids.slice(index * CHUNK, (index + 1) * CHUNK),
  );

const inSequence = <T>(items: T[], run: (item: T) => Promise<unknown>) =>
  items.reduce(
    (chain, item) => chain.then(() => run(item)),
    Promise.resolve<unknown>(undefined),
  );

/** Takes a who or place off every record linking it, then deletes it. Each chunk re-reads its records in a transaction, so one edited meanwhile keeps its other changes; a connection is needed. The person's own who is refused. */
export async function forgetLinked(
  uid: string,
  target: 'who' | 'places',
  id: string,
): Promise<Forgotten> {
  const ref = doc(userOf(uid), target, id);
  const links = LINKED_FROM[target];
  const current = await getDoc(ref);
  if (!current.exists()) throw new Error('This is already gone.');
  if ((current.data() as DocumentData).isSelf === true) {
    throw new Error('This is you.');
  }
  const found = await Promise.all(
    links.map(async ({ source, field }) => ({
      source,
      field,
      ids: (
        await getDocs(
          query(
            collection(userOf(uid), source),
            where(field, 'array-contains', id),
          ),
        )
      ).docs.map((entry) => entry.id),
    })),
  );
  const taken = await Promise.all(
    found.map(async ({ source, field, ids }) => {
      const chunks = await Promise.all(
        toChunks(ids).map((chunk) =>
          runTransaction(db, async (transaction) => {
            const snapshots = await Promise.all(
              chunk.map((entryId) =>
                transaction.get(doc(collection(userOf(uid), source), entryId)),
              ),
            );
            return snapshots.flatMap((snapshot) => {
              const list = (snapshot.data() as DocumentData | undefined)?.[
                field
              ] as unknown;
              if (!Array.isArray(list) || !list.includes(id)) return [];
              transaction.update(snapshot.ref, { [field]: arrayRemove(id) });
              return [snapshot.id];
            });
          }),
        ),
      );
      return { source, field, ids: chunks.flat() };
    }),
  );
  const raw = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as DocumentData | undefined;
    if (!data) return null;
    if (data.isSelf === true) throw new Error('This is you.');
    transaction.delete(ref);
    return data;
  });
  if (!raw) throw new Error('This is already gone.');
  const countOf = (source: LinkSource) =>
    taken.find((entry) => entry.source === source)?.ids.length ?? 0;
  const restore = async (): Promise<RestoreOutcome> => {
    const isBack = await runTransaction(db, async (transaction) => {
      if ((await transaction.get(ref)).exists()) return false;
      transaction.set(ref, { ...raw, lastEditedAt: Date.now() });
      return true;
    });
    if (!isBack) return 'exists';
    await inSequence(taken, ({ source, field, ids }) =>
      inSequence(toChunks(ids), (chunk) =>
        runTransaction(db, async (transaction) => {
          const snapshots = await Promise.all(
            chunk.map((entryId) =>
              transaction.get(doc(collection(userOf(uid), source), entryId)),
            ),
          );
          snapshots
            .filter((snapshot) => snapshot.exists())
            .forEach((snapshot) =>
              transaction.update(snapshot.ref, { [field]: arrayUnion(id) }),
            );
        }),
      ),
    );
    return 'restored';
  };
  return {
    counts: {
      tasks: countOf('tasks'),
      captures: countOf('captures'),
      who: countOf('who'),
    },
    restore,
  };
}

export const forgetWho = (uid: string, whoId: string) =>
  forgetLinked(uid, 'who', whoId);

/** Makes the person's own who once; the transaction keeps two tabs from making two. */
export async function ensureSelfWho(
  uid: string,
  encryption: HelmEncryption,
  name: string,
) {
  const profileRef = doc(db, 'apps', 'helm', 'users', uid);
  const whoRef = doc(db, 'apps', 'helm', 'users', uid, 'who', 'self');
  const now = Date.now();
  const sealed = await sealJson<WhoSealed>(
    {
      name,
      aliases: [],
      relation: null,
      phone: null,
      email: null,
      notes: null,
      species: null,
      organizationKind: null,
    },
    encryption,
  );
  const who: Who = {
    kind: 'person',
    tier: 'close',
    tierSetBy: 'person',
    isSelf: true,
    placeIds: [],
    photoMediaId: null,
    mediaIds: [],
    importedFrom: null,
    importedFields: {},
    lastMentionedAt: null,
    yearlyDateCount: 0,
    momentCount: 0,
    createdBy: 'person',
    executionId: null,
    createdAt: now,
    lastEditedAt: null,
    sealed,
  };

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (!snapshot.exists()) return;
    const profile = snapshot.data() as Partial<HelmProfile>;
    if (profile.selfWhoId) return;
    transaction.set(whoRef, who);
    transaction.update(profileRef, { selfWhoId: whoRef.id });
  });
}
