import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  type DocumentData,
  getDoc,
  getCountFromServer,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { openJson, sealJson } from '@apps/helm/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  deleteWhoDatesIn,
  readWhoDateIds,
  readWhoDatesIn,
  restoreWhoDates,
} from '@apps/helm/store/actions/keyDateActions';
import {
  getPhotoIdsOf,
  removeMediaOf,
  type PhotoOwner,
} from '@apps/helm/store/actions/mediaActions';
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

/** A level the person picks is theirs: the assistant never changes it after. Undo writes the earlier level back with whoever set it. */
export const setWhoTier = (
  uid: string,
  whoId: string,
  tier: WhoTier,
  tierSetBy: Who['tierSetBy'] = 'person',
) =>
  updateDoc(doc(userOf(uid), 'who', whoId), {
    tier,
    tierSetBy,
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
  /** Facts that were only about the forgotten record and went with it. */
  facts: number;
}

/** The links already taken could not all be put back after a failure, so some may be gone. */
export class ForgetPartialError extends Error {
  constructor() {
    super('Some links may already be gone.');
  }
}

export type RestoreOutcome =
  'restored' | 'exists' | 'withoutPhotos' | 'withoutDates';

export interface Forgotten {
  counts: ForgetCounts;
  /** Puts the record back and its id on the records it was taken from that still exist. */
  restore: () => Promise<RestoreOutcome>;
}

type FactTaken =
  | { kind: 'deleted'; id: string; data: DocumentData }
  | { kind: 'trimmed'; id: string };

const toChunks = (ids: string[]) =>
  Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, index) =>
    ids.slice(index * CHUNK, (index + 1) * CHUNK),
  );

const inSequence = <T>(items: T[], run: (item: T) => Promise<unknown>) =>
  items.reduce(
    (chain, item) => chain.then(() => run(item)),
    Promise.resolve<unknown>(undefined),
  );

/** How many tasks, open or done, link a who or place; needs a connection. */
export async function countLinkedTasks(
  uid: string,
  target: 'who' | 'places',
  id: string,
) {
  const field = target === 'who' ? 'whoIds' : 'placeIds';
  const snapshot = await getCountFromServer(
    query(collection(userOf(uid), 'tasks'), where(field, 'array-contains', id)),
  );
  return snapshot.data().count;
}

/** How many facts are only about this who or place, so forgetting it forgets them too; needs a connection. */
export async function countOnlyFacts(uid: string, id: string) {
  const snapshot = await getDocs(
    query(
      collection(userOf(uid), 'facts'),
      where('subjectIds', 'array-contains', id),
    ),
  );
  return snapshot.docs.filter((entry) => {
    const data = entry.data() as DocumentData;
    return data.subjectIds?.length === 1 && data.status !== 'superseded';
  }).length;
}

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
  const jobs = found.flatMap(({ source, field, ids }) =>
    toChunks(ids).map((chunk) => ({ source, field, chunk })),
  );
  const outcomes = await Promise.allSettled(
    jobs.map(({ source, field, chunk }) =>
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
  const taken = jobs.flatMap(({ source, field }, index) => {
    const outcome = outcomes[index];
    return outcome.status === 'fulfilled'
      ? [{ source, field, ids: outcome.value }]
      : [];
  });
  const putBackLinks = () =>
    inSequence(taken, ({ source, field, ids }) =>
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
  const factField = target === 'who' ? 'whoIds' : 'placeIds';
  const factIds = (
    await getDocs(
      query(
        collection(userOf(uid), 'facts'),
        where('subjectIds', 'array-contains', id),
      ),
    )
  ).docs.map((entry) => entry.id);
  const factOutcomes = await Promise.allSettled(
    toChunks(factIds).map((chunk) =>
      runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          chunk.map((entryId) =>
            transaction.get(doc(collection(userOf(uid), 'facts'), entryId)),
          ),
        );
        return snapshots.flatMap((snapshot): FactTaken[] => {
          const data = snapshot.data() as DocumentData | undefined;
          const subjects: unknown = data?.subjectIds;
          if (!data || !Array.isArray(subjects) || !subjects.includes(id)) {
            return [];
          }
          if (subjects.length === 1) {
            transaction.delete(snapshot.ref);
            return [{ kind: 'deleted', id: snapshot.id, data }];
          }
          transaction.update(snapshot.ref, {
            [factField]: arrayRemove(id),
            subjectIds: arrayRemove(id),
          });
          return [{ kind: 'trimmed', id: snapshot.id }];
        });
      }),
    ),
  );
  const factsTaken = factOutcomes.flatMap((outcome) =>
    outcome.status === 'fulfilled' ? outcome.value : [],
  );
  const putBackFacts = () =>
    inSequence(factsTaken, (entry) =>
      runTransaction(db, async (transaction) => {
        const factRef = doc(collection(userOf(uid), 'facts'), entry.id);
        const current = await transaction.get(factRef);
        if (entry.kind === 'deleted') {
          if (!current.exists()) transaction.set(factRef, entry.data);
        } else if (current.exists()) {
          transaction.update(factRef, {
            [factField]: arrayUnion(id),
            subjectIds: arrayUnion(id),
          });
        }
      }),
    );
  const putBack = () =>
    Promise.allSettled([putBackLinks(), putBackFacts()]).then((settled) => {
      const failed = settled.find((entry) => entry.status === 'rejected');
      if (failed) throw failed.reason;
    });
  const failedOutcome = (
    [...outcomes, ...factOutcomes] as PromiseSettledResult<unknown>[]
  ).find((outcome) => outcome.status === 'rejected');
  const abandon = async (reason: unknown): Promise<never> => {
    await putBack().catch((error: unknown) => {
      console.error('Helm links were not put back', error);
      throw new ForgetPartialError();
    });
    throw reason;
  };
  if (failedOutcome) await abandon(failedOutcome.reason);
  const encryption =
    target === 'who' ? await getHelmEncryption(uid).catch(abandon) : null;
  const dateIds =
    encryption !== null ? await readWhoDateIds(uid, id).catch(abandon) : [];
  const removed = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as DocumentData | undefined;
    if (!data) return null;
    if (data.isSelf === true) throw new Error('This is you.');
    const dates = encryption
      ? await readWhoDatesIn(transaction, uid, encryption, id, dateIds)
      : null;
    transaction.delete(ref);
    if (encryption && dates) {
      await deleteWhoDatesIn(transaction, uid, encryption, id, dates);
    }
    return { data, dates };
  }).catch(abandon);
  if (!removed) throw new Error('This is already gone.');
  const raw = removed.data;
  const countOf = (source: LinkSource) =>
    taken
      .filter((entry) => entry.source === source)
      .reduce((sum, entry) => sum + entry.ids.length, 0);
  const restore = async (): Promise<RestoreOutcome> => {
    const homeIds =
      target === 'places' && raw.isHome === true
        ? (
            await getDocs(
              query(
                collection(userOf(uid), 'places'),
                where('isHome', '==', true),
              ),
            )
          ).docs.map((entry) => entry.id)
        : [];
    const isBack = await runTransaction(db, async (transaction) => {
      if ((await transaction.get(ref)).exists()) return false;
      const homes = await Promise.all(
        homeIds.map((homeId) =>
          transaction.get(doc(collection(userOf(uid), 'places'), homeId)),
        ),
      );
      const hasOtherHome = homes.some(
        (home) => home.exists() && home.data()?.isHome === true,
      );
      transaction.set(ref, {
        ...raw,
        ...(hasOtherHome ? { isHome: false } : {}),
        lastEditedAt: Date.now(),
      });
      return true;
    });
    if (!isBack) return 'exists';
    const areDatesBack =
      encryption && removed.dates
        ? await restoreWhoDates(uid, encryption, id, removed.dates).then(
            () => true,
            (error: unknown) => {
              console.error('Helm dates were not put back', error);
              return false;
            },
          )
        : true;
    await putBack();
    return areDatesBack ? 'restored' : 'withoutDates';
  };
  return {
    counts: {
      tasks: countOf('tasks'),
      captures: countOf('captures'),
      who: countOf('who'),
      facts: factsTaken.filter(
        (entry) =>
          entry.kind === 'deleted' && entry.data.status !== 'superseded',
      ).length,
    },
    restore,
  };
}

/** Forgets a who or place and deletes its photos with it; Undo puts the photos and then the record back. A photo that cannot be deleted puts the record back and fails. */
export async function forgetWithPhotos(
  uid: string,
  target: 'who' | 'places',
  id: string,
): Promise<Forgotten> {
  const owner: PhotoOwner = { kind: target === 'who' ? 'who' : 'place', id };
  const listedIds = await getPhotoIdsOf(uid, owner);
  const forgotten = await forgetLinked(uid, target, id);
  // A photo added from another device during the forget is only found after it.
  const photos = await getPhotoIdsOf(uid, owner)
    .then((later) => {
      const photoIds = Array.from(new Set([...listedIds, ...later]));
      return photoIds.length > 0 ? removeMediaOf(uid, photoIds) : null;
    })
    .catch(async (error: unknown) => {
      await forgotten.restore().catch((restoreError: unknown) => {
        console.error('Helm forgotten record was not put back', restoreError);
      });
      throw error;
    });
  if (!photos) return forgotten;
  return {
    ...forgotten,
    restore: async () => {
      const arePhotosBack = await photos.restore().then(
        () => true,
        (error: unknown) => {
          console.error('Helm photos were not put back', error);
          return false;
        },
      );
      const outcome = await forgotten.restore();
      return arePhotosBack ? outcome : 'withoutPhotos';
    },
  };
}

export const forgetWho = (uid: string, whoId: string) =>
  forgetWithPhotos(uid, 'who', whoId);

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
