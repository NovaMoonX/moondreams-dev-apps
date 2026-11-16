import { collection, doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { cutCorrection, normaliseClaim } from '@apps/helm/engine/seenAs';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sealJson } from '@apps/helm/security';
import type { OpenSeenAs } from '@apps/helm/store/listeners/seenAsListener';
import type { SeenAsSealed } from '@apps/helm/types';

export interface SeenAsChange {
  /** Puts back exactly what the line held before the change; false when the line changed since, and is left alone. */
  undo: () => Promise<boolean>;
}

const lineRef = (uid: string, id: string) =>
  doc(collection(db, 'apps', 'helm', 'users', uid, 'seenAs'), id);

const findLine = (id: string) =>
  store.getState().helm.seenAs.items.find((one) => one.id === id) ?? null;

interface Written {
  state: OpenSeenAs['state'];
  at: number;
}

/** Puts the fields and the words of a line back as `before` held them, only while the line still holds what this change wrote. */
const restore = async (uid: string, before: OpenSeenAs, written: Written) => {
  const sealed = await sealJson<SeenAsSealed>(
    { line: before.line, basis: before.basis, corrected: before.corrected },
    await getHelmEncryption(uid),
  );
  const ref = lineRef(uid, before.id);
  return runTransaction(db, async (transaction) => {
    const live = await transaction.get(ref);
    if (!live.exists()) return false;
    const data = live.data();
    const stamp =
      written.state === 'corrected' ? data.correctedAt : data.removedAt;
    if (data.state !== written.state || stamp !== written.at) return false;
    transaction.update(ref, {
      state: before.state,
      correctedAt: before.correctedAt,
      removedAt: before.removedAt,
      dontDrawFrom: before.dontDrawFrom,
      sealed,
    });
    return true;
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
  const at = Date.now();
  await updateDoc(lineRef(uid, id), {
    state: 'corrected',
    correctedAt: at,
    sealed,
  });
  return { undo: () => restore(uid, before, { state: 'corrected', at }) };
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
  const at = Date.now();
  await updateDoc(lineRef(uid, id), {
    state: 'removed',
    removedAt: at,
    dontDrawFrom: before.sourceKeys,
    sealed,
  });
  return { undo: () => restore(uid, before, { state: 'removed', at }) };
}
