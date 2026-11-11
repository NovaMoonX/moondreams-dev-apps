import { queryOptions } from '@tanstack/react-query';
import {
  collection,
  getDocs,
  limit,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { createSealedReader, type SealedReader } from '@lib/security';

import {
  getHelmEncryption,
  helmQueryKeys,
} from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { openMoment } from '@apps/helm/store/listeners/momentListener';
import type { WhoMoment } from '@apps/helm/utils/moments';

const PAGE = 500;

/** An equality-only query lists by document id, so the cursor pages it without an index of its own. */
const readFrom = async (
  uid: string,
  read: SealedReader,
  after: QueryDocumentSnapshot | null,
): Promise<WhoMoment[]> => {
  const snapshot = await getDocs(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'keyDates'),
      where('shape', '==', 'moment'),
      ...(after ? [startAfter(after)] : []),
      limit(PAGE),
    ),
  );
  const opened = (
    await Promise.all(snapshot.docs.map((entry) => openMoment(entry, read)))
  ).flat();
  const last = snapshot.docs.at(-1);
  return snapshot.docs.length < PAGE || !last
    ? opened
    : [...opened, ...(await readFrom(uid, read, last))];
};

/** Every moment, read in pages of 500 and opened on the device, held for the session only: dropped with the data key, never persisted. */
export const momentsQueryOptions = (uid: string) =>
  queryOptions({
    queryKey: [...helmQueryKeys.all, 'moments', uid] as const,
    queryFn: async () =>
      readFrom(
        uid,
        createSealedReader(await getHelmEncryption(uid), openJson),
        null,
      ),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
