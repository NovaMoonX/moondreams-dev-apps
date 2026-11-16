import { collection, doc, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { cutCorrection, normaliseClaim } from '@apps/helm/engine/seenAs';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sealJson } from '@apps/helm/security';
import type { OpenSeenAs } from '@apps/helm/store/listeners/seenAsListener';
import type { SeenAsSealed } from '@apps/helm/types';

export interface SeenAsChange {
  /** Puts back exactly what the line held before the change. */
  undo: () => Promise<void>;
}

const lineRef = (uid: string, id: string) =>
  doc(collection(db, 'apps', 'helm', 'users', uid, 'seenAs'), id);

const findLine = (id: string) =>
  store.getState().helm.seenAs.items.find((one) => one.id === id) ?? null;

/** Puts the fields and the words of a line back as `before` held them. */
const restore = async (uid: string, before: OpenSeenAs) => {
  const sealed = await sealJson<SeenAsSealed>(
    { line: before.line, basis: before.basis, corrected: before.corrected },
    await getHelmEncryption(uid),
  );
  await updateDoc(lineRef(uid, before.id), {
    state: before.state,
    correctedAt: before.correctedAt,
    removedAt: before.removedAt,
    dontDrawFrom: before.dontDrawFrom,
    sealed,
  });
};

/** "That's not quite right": the person's words become the line, outranking the guess; its sealed line and basis stay. */
export async function correctSeenAs(
  uid: string,
  id: string,
  words: string,
): Promise<SeenAsChange | null> {
  const before = findLine(id);
  const corrected = cutCorrection(words);
  if (!before || corrected === '') return null;
  const sealed = await sealJson<SeenAsSealed>(
    { line: before.line, basis: before.basis, corrected },
    await getHelmEncryption(uid),
  );
  await updateDoc(lineRef(uid, id), {
    state: 'corrected',
    correctedAt: Date.now(),
    sealed,
  });
  return { undo: () => restore(uid, before) };
}

/** "Remove this": the line is forgotten and its sources are marked, so no new line of the kind is drawn from them; the words behind it stay where they were said. */
export async function removeSeenAs(
  uid: string,
  id: string,
): Promise<SeenAsChange | null> {
  const before = findLine(id);
  if (!before) return null;
  const sealed = await sealJson<SeenAsSealed>(
    { line: normaliseClaim(before.line), basis: before.basis, corrected: null },
    await getHelmEncryption(uid),
  );
  await updateDoc(lineRef(uid, id), {
    state: 'removed',
    removedAt: Date.now(),
    dontDrawFrom: before.sourceKeys,
    sealed,
  });
  return { undo: () => restore(uid, before) };
}
