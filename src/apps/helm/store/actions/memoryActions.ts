import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { sealJson } from '@apps/helm/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import type { Fact, FactKind, FactSealed } from '@apps/helm/types';
import {
  planPhotoRelease,
  type ReleasablePhoto,
} from '@apps/helm/utils/mediaRelease';

/** A change that went through, with the way to take it back; `undo` says false when the fact changed since and was left alone. */
export type FactChange =
  | { kind: 'done'; undo: () => Promise<boolean> }
  | { kind: 'changed' }
  | { kind: 'offline' };

export interface FactSubject {
  kind: 'who' | 'place';
  id: string;
}

const factsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'facts');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

const guard = async (run: () => Promise<FactChange>): Promise<FactChange> => {
  if (!navigator.onLine) return { kind: 'offline' };
  try {
    return await run();
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
};

/** Says an inferred fact is right: it becomes confirmed and reads "You confirmed". Undo makes it inferred again, only while it is as it was left. */
export const confirmFact = (uid: string, factId: string) =>
  guard(async (): Promise<FactChange> => {
    const ref = doc(factsOf(uid), factId);
    const now = Date.now();
    const before = await runTransaction(db, async (transaction) => {
      const data = (await transaction.get(ref)).data() as
        Partial<Fact> | undefined;
      if (data?.status !== 'inferred') return null;
      transaction.update(ref, {
        status: 'confirmed',
        confirmedAt: now,
        lastEditedAt: now,
      });
      return { lastEditedAt: data.lastEditedAt ?? null };
    });
    if (!before) return { kind: 'changed' };
    return {
      kind: 'done',
      undo: () =>
        runTransaction(db, async (transaction) => {
          const data = (await transaction.get(ref)).data() as
            Partial<Fact> | undefined;
          if (data?.status !== 'confirmed' || data.confirmedAt !== now) {
            return false;
          }
          transaction.update(ref, {
            status: 'inferred',
            confirmedAt: null,
            lastEditedAt: before.lastEditedAt,
          });
          return true;
        }),
    };
  });

/** Replaces a fact's words: the old one is kept as superseded and a confirmed, corrected one takes its subjects. Undo removes the new fact and brings the old one back, only while the new one is untouched. */
export const correctFact = (
  uid: string,
  factId: string,
  statement: string,
  topic: string | null,
) =>
  guard(async (): Promise<FactChange> => {
    const facts = factsOf(uid);
    const oldRef = doc(facts, factId);
    const newRef = doc(facts);
    const sealed = await sealJson<FactSealed>(
      {
        statement,
        quote: null,
        topic,
        value: null,
        privateMark: null,
        isPrivacyCleared: false,
      },
      await getHelmEncryption(uid),
    );
    const now = Date.now();
    const before = await runTransaction(db, async (transaction) => {
      const data = (await transaction.get(oldRef)).data() as
        Partial<Fact> | undefined;
      if (!data || data.status === 'superseded') return null;
      const partnerId = data.disputedWithId ?? null;
      const partnerRef = partnerId ? doc(facts, partnerId) : null;
      const partner = partnerRef
        ? ((await transaction.get(partnerRef)).data() as
            Partial<Fact> | undefined)
        : undefined;
      const next: Omit<Fact, 'sealed'> = {
        status: 'confirmed',
        stated: 'personCorrected',
        kind: data.kind ?? 'world',
        occurredOn: data.occurredOn ?? null,
        sourceCaptureId: null,
        sourceExecutionId: null,
        sourceConnection: null,
        aboutField: null,
        whoIds: data.whoIds ?? [],
        placeIds: data.placeIds ?? [],
        projectIds: data.projectIds ?? [],
        syncedIds: data.syncedIds ?? [],
        subjectIds: data.subjectIds ?? [],
        keptOverSource: null,
        supersedesId: factId,
        supersededById: null,
        supersededAt: null,
        disputedWithId: null,
        privacy: 'ordinary',
        createdAt: now,
        confirmedAt: now,
        lastEditedAt: null,
      };
      transaction.set(newRef, { ...next, sealed });
      transaction.update(oldRef, {
        status: 'superseded',
        supersededById: newRef.id,
        supersededAt: now,
        disputedWithId: null,
        lastEditedAt: now,
      });
      const frees = partnerRef && partner?.disputedWithId === factId;
      if (frees) transaction.update(partnerRef, { disputedWithId: null });
      return {
        status: data.status ?? 'inferred',
        lastEditedAt: data.lastEditedAt ?? null,
        disputedWithId: partnerId,
        isPartnerFreed: Boolean(frees),
      };
    });
    if (!before) return { kind: 'changed' };
    return {
      kind: 'done',
      undo: () =>
        runTransaction(db, async (transaction) => {
          const partnerRef = before.disputedWithId
            ? doc(facts, before.disputedWithId)
            : null;
          const [added, old, partner] = await Promise.all([
            transaction.get(newRef),
            transaction.get(oldRef),
            partnerRef ? transaction.get(partnerRef) : null,
          ]);
          const addedData = added.data() as Partial<Fact> | undefined;
          const oldData = old.data() as Partial<Fact> | undefined;
          if (
            addedData?.status !== 'confirmed' ||
            addedData.lastEditedAt !== null
          ) {
            return false;
          }
          transaction.delete(newRef);
          if (oldData?.supersededById === newRef.id) {
            transaction.update(oldRef, {
              status: before.status,
              supersededById: null,
              supersededAt: null,
              disputedWithId: before.disputedWithId,
              lastEditedAt: before.lastEditedAt,
            });
          }
          if (
            partnerRef &&
            before.isPartnerFreed &&
            partner?.exists() &&
            partner.data().disputedWithId === null
          ) {
            transaction.update(partnerRef, { disputedWithId: factId });
          }
          return true;
        }),
    };
  });

const MAX_CHAIN = 20;

/** Deletes a fact and the earlier facts it replaced, and lets go of the photos kept only on them for 24 hours; Undo writes them back under the same ids, unless one is there again, and keeps the photos again. */
export const forgetFact = (
  uid: string,
  factId: string,
  photos: ReleasablePhoto[],
) =>
  guard(async (): Promise<FactChange> => {
    const ref = doc(factsOf(uid), factId);
    const mediaRef = (id: string) =>
      doc(db, 'apps', 'helm', 'users', uid, 'media', id);
    const now = Date.now();
    const taken = await runTransaction(db, async (transaction) => {
      const readChain = async (
        id: string | null,
        seen: string[],
      ): Promise<{ id: string; data: DocumentData }[]> => {
        if (!id || seen.includes(id) || seen.length >= MAX_CHAIN) return [];
        const data = (await transaction.get(doc(factsOf(uid), id))).data() as
          DocumentData | undefined;
        if (!data) return [];
        const supersedesId =
          typeof data.supersedesId === 'string' ? data.supersedesId : null;
        return [
          { id, data },
          ...(await readChain(supersedesId, [...seen, id])),
        ];
      };
      const chain = await readChain(factId, []);
      const partnerId =
        typeof chain[0]?.data.disputedWithId === 'string'
          ? chain[0].data.disputedWithId
          : null;
      const partnerRef = partnerId ? doc(factsOf(uid), partnerId) : null;
      const partner = partnerRef
        ? ((await transaction.get(partnerRef)).data() as
            DocumentData | undefined)
        : undefined;
      chain.forEach((entry) => transaction.delete(doc(factsOf(uid), entry.id)));
      const released = planPhotoRelease(
        photos,
        chain.map((entry) => ({ kind: 'fact', id: entry.id })),
        now,
      );
      released.forEach((entry) =>
        transaction.update(mediaRef(entry.id), entry.forward),
      );
      const frees = partnerRef && partner?.disputedWithId === factId;
      if (frees) transaction.update(partnerRef, { disputedWithId: null });
      return { chain, released, partnerId: frees ? partnerId : null };
    });
    if (taken.chain.length === 0) return { kind: 'changed' };
    return {
      kind: 'done',
      undo: () =>
        runTransaction(db, async (transaction) => {
          const partnerRef = taken.partnerId
            ? doc(factsOf(uid), taken.partnerId)
            : null;
          const [current, partner, photoDocs] = await Promise.all([
            transaction.get(ref),
            partnerRef ? transaction.get(partnerRef) : null,
            Promise.all(
              taken.released.map((entry) =>
                transaction.get(mediaRef(entry.id)),
              ),
            ),
          ]);
          if (current.exists()) return false;
          taken.chain.forEach((entry) =>
            transaction.set(doc(factsOf(uid), entry.id), entry.data),
          );
          taken.released.forEach((entry, index) => {
            if (photoDocs[index].exists()) {
              transaction.update(mediaRef(entry.id), entry.back);
            }
          });
          if (
            partnerRef &&
            partner?.exists() &&
            partner.data().disputedWithId === null
          ) {
            transaction.update(partnerRef, { disputedWithId: factId });
          }
          return true;
        }),
    };
  });

/** Adds a fact the person types about a person, pet, organization or place, or about themself as a preference, favorite or who they are: confirmed, said by them, from no capture. Undo deletes it. */
export const addFact = (
  uid: string,
  subject: FactSubject,
  statement: string,
  about: { kind: FactKind; topic: string | null } = {
    kind: 'world',
    topic: null,
  },
) =>
  guard(async (): Promise<FactChange> => {
    const ref = doc(factsOf(uid));
    const now = Date.now();
    const sealed = await sealJson<FactSealed>(
      {
        statement,
        quote: null,
        topic: about.topic,
        value: null,
        privateMark: null,
        isPrivacyCleared: false,
      },
      await getHelmEncryption(uid),
    );
    const fact: Fact = {
      status: 'confirmed',
      stated: 'personSaid',
      kind: about.kind,
      occurredOn: null,
      sourceCaptureId: null,
      sourceExecutionId: null,
      sourceConnection: null,
      aboutField: null,
      whoIds: subject.kind === 'who' ? [subject.id] : [],
      placeIds: subject.kind === 'place' ? [subject.id] : [],
      projectIds: [],
      syncedIds: [],
      subjectIds: [subject.id],
      keptOverSource: null,
      supersedesId: null,
      supersededById: null,
      supersededAt: null,
      disputedWithId: null,
      privacy: 'ordinary',
      createdAt: now,
      confirmedAt: now,
      lastEditedAt: null,
      sealed,
    };
    // The write queues on a weak connection; waiting on it would hold the sheet open.
    void setDoc(ref, fact).catch((error: unknown) =>
      console.error('Helm fact was not added', error),
    );
    return {
      kind: 'done',
      undo: async () => {
        await deleteDoc(ref);
        return true;
      },
    };
  });
